from sqlalchemy import Column, String, Float, ForeignKey
from database import Base

class CompteORM(Base):
    __tablename__ = "comptes"

    id = Column(String, primary_key=True, index=True)
    nom = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    solde = Column(Float, default=0.0)
    date_creation = Column(String, nullable=False)
    code_hash = Column(String, nullable=False)

class TransactionORM(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, index=True)
    type = Column(String, nullable=False)  # "depot", "retrait", "transfert_emis", "transfert_recu"
    montant = Column(Float, nullable=False)
    date = Column(String, nullable=False)
    description = Column(String, nullable=False)
    compte_source = Column(String, ForeignKey("comptes.id", ondelete="SET NULL"), nullable=True)
    compte_destination = Column(String, ForeignKey("comptes.id", ondelete="SET NULL"), nullable=True)
