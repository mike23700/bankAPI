import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Récupérer l'URL de base de données depuis l'environnement
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Par défaut, SQLite local
    DATABASE_URL = "sqlite:///./banque.db"
elif DATABASE_URL.startswith("postgres://"):
    # SQLAlchemy requiert 'postgresql://' au lieu de 'postgres://'
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configuration spécifique à SQLite pour autoriser les accès multi-threads dans FastAPI
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dépendance pour obtenir la session dans les routes FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
