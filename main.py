from fastapi import FastAPI, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from sqlalchemy.orm import Session
import database
import models

# Créer les tables de base de données si elles n'existent pas
database.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="API Banque",
    description="""
    ## Système bancaire complet avec authentification JWT
    
    ### Fonctionnalités principales :
    - **Authentification sécurisée** avec tokens JWT
    - **Création de comptes** bancaires
    - **Opérations bancaires** : dépôts, retraits, transferts
    - **Recherche de comptes** par nom/email/ID
    - **Historique des transactions**
    - **Suppression de comptes** (avec validation)
    - **Base de données persistante** (SQLite en local, PostgreSQL en production)
    
    ### Documentation complète :
    Consultez le guide d'utilisation détaillé : **[GUIDE_SWAGGER.md](https://github.com/mike23700/bankAPI/blob/main/GUIDE_SWAGGER.md)**
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Autoriser toutes les origines (utile pour le dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files if directory exists
os.makedirs("frontend", exist_ok=True)
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/")
def serve_frontend():
    return FileResponse("frontend/index.html")

# Configuration JWT
SECRET_KEY = "votre-cle-secrete-tres-longue-et-complexe"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configuration du hashage de mots de passe
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Modèles
class CompteCreate(BaseModel):
    nom: str
    email: EmailStr
    code: str  # servira de mot de passe
    solde_initial: float = 0.0

class Compte(BaseModel):
    id: str
    nom: str
    email: EmailStr
    solde: float
    date_creation: str
    code_hash: str  # mot de passe hashé

    class Config:
        orm_mode = True
        from_attributes = True

class CompteResponse(BaseModel):
    id: str
    nom: str
    email: EmailStr
    solde: float
    date_creation: str

    class Config:
        orm_mode = True
        from_attributes = True

class Transaction(BaseModel):
    id: str
    type: str  # "depot", "retrait", "transfert_emis", "transfert_recu"
    montant: float
    date: str
    description: str
    compte_source: Optional[str] = None
    compte_destination: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class DepotRequest(BaseModel):
    montant: float
    description: str = "Dépôt"

class RetraitRequest(BaseModel):
    montant: float
    description: str = "Retrait"

class TransfertRequest(BaseModel):
    montant: float
    compte_destination_id: str
    description: str = "Transfert"

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class SuppressionCompteRequest(BaseModel):
    confirmation: bool
    mot_de_passe: str

# Fonctions utilitaires
def verifier_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Impossible de valider les identifiants",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    compte = db.query(models.CompteORM).filter(models.CompteORM.email == token_data.email).first()
    if compte is None:
        raise credentials_exception
    return compte

# créer un compte
@app.post("/comptes/", response_model=CompteResponse, status_code=201)
def creer_compte(compte: CompteCreate, db: Session = Depends(database.get_db)):
    try:
        # Vérifier email unique
        compte_existant = db.query(models.CompteORM).filter(models.CompteORM.email == compte.email).first()
        if compte_existant:
            raise HTTPException(status_code=400, detail="Email déjà utilisé")
        
        # Valider solde initial
        if compte.solde_initial < 0:
            raise HTTPException(status_code=400, detail="Le solde initial ne peut pas être négatif")

        code_hash = get_password_hash(compte.code)

        nouveau = models.CompteORM(
            id=str(uuid.uuid4())[:8],
            nom=compte.nom,
            email=compte.email,
            solde=compte.solde_initial,
            date_creation=str(datetime.now()),
            code_hash=code_hash
        )

        db.add(nouveau)
        db.commit()
        db.refresh(nouveau)
        
        # Créer transaction de dépôt initial si > 0
        if compte.solde_initial > 0:
            transaction = models.TransactionORM(
                id=str(uuid.uuid4())[:8],
                type="depot",
                montant=compte.solde_initial,
                date=str(datetime.now()),
                description="Dépôt initial",
                compte_destination=nouveau.id
            )
            db.add(transaction)
            db.commit()
        
        return nouveau

    except HTTPException as he:
        raise he
    except Exception as e:
        print("ERREUR DANS CREATION COMPTE:", str(e))
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

# Connexion
@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    # Chercher le compte par email (username dans form_data)
    compte = db.query(models.CompteORM).filter(models.CompteORM.email == form_data.username).first()
    
    if not compte or not verifier_password(form_data.password, compte.code_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": compte.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# liste des comptes (admin seulement)
@app.get("/comptes/", response_model=List[CompteResponse])
def lister_comptes(current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    comptes = db.query(models.CompteORM).all()
    return comptes

# Mon compte
@app.get("/mon-compte", response_model=CompteResponse)
def obtenir_mon_compte(current_user: models.CompteORM = Depends(get_current_user)):
    return current_user

# Dépôt
@app.post("/depot")
def depot(depot_request: DepotRequest, current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    if depot_request.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    # Mettre à jour le solde
    current_user.solde += depot_request.montant
    
    # Créer la transaction
    transaction = models.TransactionORM(
        id=str(uuid.uuid4())[:8],
        type="depot",
        montant=depot_request.montant,
        date=str(datetime.now()),
        description=depot_request.description,
        compte_destination=current_user.id
    )
    db.add(transaction)
    db.commit()
    
    return {"message": f"Dépôt de {depot_request.montant} FCFA effectué", "nouveau_solde": current_user.solde}

# Retrait
@app.post("/retrait")
def retrait(retrait_request: RetraitRequest, current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    if retrait_request.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    if current_user.solde < retrait_request.montant:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    
    # Mettre à jour le solde
    current_user.solde -= retrait_request.montant
    
    # Créer la transaction
    transaction = models.TransactionORM(
        id=str(uuid.uuid4())[:8],
        type="retrait",
        montant=retrait_request.montant,
        date=str(datetime.now()),
        description=retrait_request.description,
        compte_source=current_user.id
    )
    db.add(transaction)
    db.commit()
    
    return {"message": f"Retrait de {retrait_request.montant} FCFA effectué", "nouveau_solde": current_user.solde}

# Transfert
@app.post("/transfert")
def transfert(transfert_request: TransfertRequest, current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    if transfert_request.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    if current_user.solde < transfert_request.montant:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    
    # Trouver le compte destination
    compte_dest = db.query(models.CompteORM).filter(models.CompteORM.id == transfert_request.compte_destination_id).first()
    if not compte_dest:
        raise HTTPException(status_code=404, detail="Compte destination non trouvé")
    
    if compte_dest.id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de transférer vers son propre compte")
    
    # Effectuer le transfert
    current_user.solde -= transfert_request.montant
    compte_dest.solde += transfert_request.montant
    
    # Créer les transactions
    transaction_source = models.TransactionORM(
        id=str(uuid.uuid4())[:8],
        type="transfert_emis",
        montant=transfert_request.montant,
        date=str(datetime.now()),
        description=f"{transfert_request.description} vers {compte_dest.nom}",
        compte_source=current_user.id,
        compte_destination=compte_dest.id
    )
    
    transaction_dest = models.TransactionORM(
        id=str(uuid.uuid4())[:8],
        type="transfert_recu",
        montant=transfert_request.montant,
        date=str(datetime.now()),
        description=f"{transfert_request.description} de {current_user.nom}",
        compte_source=current_user.id,
        compte_destination=compte_dest.id
    )
    
    db.add(transaction_source)
    db.add(transaction_dest)
    db.commit()
    
    return {
        "message": f"Transfert de {transfert_request.montant} FCFA vers {compte_dest.nom} effectué",
        "nouveau_solde": current_user.solde
    }

# Recherche de comptes
@app.get("/recherche", response_model=List[CompteResponse])
def rechercher_comptes(q: str, current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    query = q.lower()
    comptes = db.query(models.CompteORM).filter(
        (models.CompteORM.nom.ilike(f"%{query}%")) |
        (models.CompteORM.email.ilike(f"%{query}%")) |
        (models.CompteORM.id == query)
    ).all()
    
    return comptes

# Historique des transactions
@app.get("/transactions", response_model=List[Transaction])
def obtenir_transactions(current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    mes_transactions = db.query(models.TransactionORM).filter(
        (models.TransactionORM.compte_source == current_user.id) |
        (models.TransactionORM.compte_destination == current_user.id)
    ).order_by(models.TransactionORM.date.desc()).all()
    
    return mes_transactions

# Suppression de compte
@app.delete("/comptes/{compte_id}")
def supprimer_compte(compte_id: str, suppression_request: SuppressionCompteRequest, current_user: models.CompteORM = Depends(get_current_user), db: Session = Depends(database.get_db)):
    # Vérifier que l'utilisateur peut supprimer ce compte (soit le sien, soit admin)
    if compte_id != current_user.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que votre propre compte")
    
    # Vérifier la confirmation
    if not suppression_request.confirmation:
        raise HTTPException(status_code=400, detail="La confirmation est requise pour supprimer le compte")
    
    # Vérifier le mot de passe
    if not verifier_password(suppression_request.mot_de_passe, current_user.code_hash):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    # Vérifier que le solde est zéro
    if current_user.solde != 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer le compte avec un solde de {current_user.solde} FCFA. Le solde doit être zéro."
        )
    
    # Supprimer les transactions associées
    db.query(models.TransactionORM).filter(
        (models.TransactionORM.compte_source == compte_id) | 
        (models.TransactionORM.compte_destination == compte_id)
    ).delete(synchronize_session=False)
    
    # Supprimer le compte
    db.delete(current_user)
    db.commit()
    
    return {"message": "Compte supprimé avec succès"}