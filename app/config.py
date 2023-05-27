import os

class Config(object):
    database_url = 'postgresql://northarena:northarena211122@na-db-instance.cbrde081pvdd.ap-southeast-2.rds.amazonaws.com:5432/north_arena_db'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', database_url)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

# Add other configurations as needed
