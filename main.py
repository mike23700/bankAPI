from fastapi import FastAPI, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

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
    
    ### Documentation complète :
    Consultez le guide d'utilisation détaillé : **[GUIDE_SWAGGER.md](https://github.com/mike23700/bankAPI/blob/main/GUIDE_SWAGGER.md)**
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

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

class CompteResponse(BaseModel):
    id: str
    nom: str
    email: EmailStr
    solde: float
    date_creation: str

class Transaction(BaseModel):
    id: str
    type: str  # "depot", "retrait", "transfert_emis", "transfert_recu"
    montant: float
    date: str
    description: str
    compte_source: Optional[str] = None
    compte_destination: Optional[str] = None

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

# "Base de données"
comptes_db: List[Compte] = []
transactions_db: List[Transaction] = []

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

async def get_current_user(token: str = Depends(oauth2_scheme)):
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
    
    compte = next((c for c in comptes_db if c.email == token_data.email), None)
    if compte is None:
        raise credentials_exception
    return compte

# créer un compte
@app.post("/comptes/", response_model=CompteResponse)
def creer_compte(compte: CompteCreate):
    try:
        print("AVANT VERIFICATION EMAIL")
        # Vérifier email unique
        for c in comptes_db:
            if c.email == compte.email:
                raise HTTPException(status_code=400, detail="Email déjà utilisé")
        
        print("AVANT VALIDATION SOLDE")
        # Valider solde initial
        if compte.solde_initial < 0:
            raise HTTPException(status_code=400, detail="Le solde initial ne peut pas être négatif")

        print("AVANT HASH")
        code_hash = get_password_hash(compte.code)
        print("APRES HASH")

        nouveau = Compte(
            id=str(uuid.uuid4())[:8],
            nom=compte.nom,
            email=compte.email,
            solde=compte.solde_initial,
            date_creation=str(datetime.now()),
            code_hash=code_hash
        )

        print("AVANT AJOUT DB")
        comptes_db.append(nouveau)
        
        # Créer transaction de dépôt initial si > 0
        if compte.solde_initial > 0:
            transaction = Transaction(
                id=str(uuid.uuid4())[:8],
                type="depot",
                montant=compte.solde_initial,
                date=str(datetime.now()),
                description="Dépôt initial",
                compte_destination=nouveau.id
            )
            transactions_db.append(transaction)
        
        print("AVANT RETOUR")
        return CompteResponse(
            id=nouveau.id,
            nom=nouveau.nom,
            email=nouveau.email,
            solde=nouveau.solde,
            date_creation=nouveau.date_creation
        )

    except Exception as e:
        print("ERREUR DANS CREATION COMPTE:", str(e))
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

# Connexion
@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Chercher le compte par email (username dans form_data)
    compte = next((c for c in comptes_db if c.email == form_data.username), None)
    
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
def lister_comptes(current_user: Compte = Depends(get_current_user)):
    return [CompteResponse(
        id=c.id,
        nom=c.nom,
        email=c.email,
        solde=c.solde,
        date_creation=c.date_creation
    ) for c in comptes_db]

# Mon compte
@app.get("/mon-compte", response_model=CompteResponse)
def obtenir_mon_compte(current_user: Compte = Depends(get_current_user)):
    return CompteResponse(
        id=current_user.id,
        nom=current_user.nom,
        email=current_user.email,
        solde=current_user.solde,
        date_creation=current_user.date_creation
    )

# Dépôt
@app.post("/depot")
def depot(depot_request: DepotRequest, current_user: Compte = Depends(get_current_user)):
    if depot_request.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    # Mettre à jour le solde
    current_user.solde += depot_request.montant
    
    # Créer la transaction
    transaction = Transaction(
        id=str(uuid.uuid4())[:8],
        type="depot",
        montant=depot_request.montant,
        date=str(datetime.now()),
        description=depot_request.description,
        compte_destination=current_user.id
    )
    transactions_db.append(transaction)
    
    return {"message": f"Dépôt de {depot_request.montant} FCFA effectué", "nouveau_solde": current_user.solde}

# Retrait
@app.post("/retrait")
def retrait(retrait_request: RetraitRequest, current_user: Compte = Depends(get_current_user)):
    if retrait_request.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    if current_user.solde < retrait_request.montant:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    
    # Mettre à jour le solde
    current_user.solde -= retrait_request.montant
    
    # Créer la transaction
    transaction = Transaction(
        id=str(uuid.uuid4())[:8],
        type="retrait",
        montant=retrait_request.montant,
        date=str(datetime.now()),
        description=retrait_request.description,
        compte_source=current_user.id
    )
    transactions_db.append(transaction)
    
    return {"message": f"Retrait de {retrait_request.montant} FCFA effectué", "nouveau_solde": current_user.solde}

# Transfert
@app.post("/transfert")
def transfert(transfert_request: TransfertRequest, current_user: Compte = Depends(get_current_user)):
    if transfert_request.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    if current_user.solde < transfert_request.montant:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    
    # Trouver le compte destination
    compte_dest = next((c for c in comptes_db if c.id == transfert_request.compte_destination_id), None)
    if not compte_dest:
        raise HTTPException(status_code=404, detail="Compte destination non trouvé")
    
    if compte_dest.id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de transférer vers son propre compte")
    
    # Effectuer le transfert
    current_user.solde -= transfert_request.montant
    compte_dest.solde += transfert_request.montant
    
    # Créer les transactions
    transaction_source = Transaction(
        id=str(uuid.uuid4())[:8],
        type="transfert_emis",
        montant=transfert_request.montant,
        date=str(datetime.now()),
        description=f"{transfert_request.description} vers {compte_dest.nom}",
        compte_source=current_user.id,
        compte_destination=compte_dest.id
    )
    
    transaction_dest = Transaction(
        id=str(uuid.uuid4())[:8],
        type="transfert_recu",
        montant=transfert_request.montant,
        date=str(datetime.now()),
        description=f"{transfert_request.description} de {current_user.nom}",
        compte_source=current_user.id,
        compte_destination=compte_dest.id
    )
    
    transactions_db.extend([transaction_source, transaction_dest])
    
    return {
        "message": f"Transfert de {transfert_request.montant} FCFA vers {compte_dest.nom} effectué",
        "nouveau_solde": current_user.solde
    }

# Recherche de comptes
@app.get("/recherche")
def rechercher_comptes(q: str, current_user: Compte = Depends(get_current_user)):
    resultats = []
    query = q.lower()
    
    for compte in comptes_db:
        if (query in compte.nom.lower() or 
            query in compte.email.lower() or 
            query == compte.id):
            resultats.append(CompteResponse(
                id=compte.id,
                nom=compte.nom,
                email=compte.email,
                solde=compte.solde,
                date_creation=compte.date_creation
            ))
    
    return resultats

# Historique des transactions
@app.get("/transactions")
def obtenir_transactions(current_user: Compte = Depends(get_current_user)):
    mes_transactions = [
        t for t in transactions_db 
        if t.compte_source == current_user.id or t.compte_destination == current_user.id
    ]
    
    # Trier par date (plus récent en premier)
    mes_transactions.sort(key=lambda x: x.date, reverse=True)
    
    return mes_transactions

# Suppression de compte
@app.delete("/comptes/{compte_id}")
def supprimer_compte(compte_id: str, suppression_request: SuppressionCompteRequest, current_user: Compte = Depends(get_current_user)):
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
    transactions_db[:] = [
        t for t in transactions_db 
        if t.compte_source != compte_id and t.compte_destination != compte_id
    ]
    
    # Supprimer le compte
    comptes_db[:] = [c for c in comptes_db if c.id != compte_id]
    
    return {"message": "Compte supprimé avec succès"}