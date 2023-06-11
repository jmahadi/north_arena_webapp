import os
from config import *
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin

app = Flask(__name__, template_folder='templates')
app.config.from_object(Config)

db = SQLAlchemy(app)

login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message_category = 'info'


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
    app.add_url_rule('/insert_user', view_func=insert_user,methods=[ 'GET', 'POST'])
    app.add_url_rule('/register', view_func=register, methods=['GET', 'POST'])
    app.add_url_rule('/login', view_func=login, methods=['GET', 'POST'])
    app.add_url_rule('/logout', view_func=logout)
    app.add_url_rule('/dashboard', view_func=dashboard)




    app.run(debug=True)
