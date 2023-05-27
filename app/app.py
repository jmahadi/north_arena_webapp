import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'postgresql://northarena:northarena211122@na-db-instance.cbrde081pvdd.ap-southeast-2.rds.amazonaws.com:5432/north_arena_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Initialize SQLAlchemy with the Flask app


# Import your models



if __name__ == '__main__':
        # Import your routes
    from routes import *
    from models import *
   
    # Register routes
    app.add_url_rule('/', view_func=index)
    app.add_url_rule('/add_column', view_func=add_column,methods=['GET', 'POST'])

    app.run(debug=True)
