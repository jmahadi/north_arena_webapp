import os
from config import *
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config.from_object(Config)

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
    app.add_url_rule('/drop_column', view_func=drop_column,methods=['GET', 'POST'])

    app.run(debug=True)
