from flask import request, render_template , jsonify ,redirect ,url_for,flash
from flask_login import login_user, logout_user, login_required, current_user 
from werkzeug.security import generate_password_hash, check_password_hash
from app import db , app ,login_manager
from sqlalchemy.sql import text
from models import User 
import datetime
import re



@app.route('/')
def index():
    return render_template('index.html')

@app.route('/add_column', methods=['GET', 'POST'])
def add_column():
    if request.method == 'POST':
        table_name = request.form.get('table_name')
        column_name = request.form.get('column_name')
        column_type = request.form.get('column_type')
        db.session.execute(text(f'ALTER TABLE public.{table_name} ADD COLUMN {column_name} {column_type}'))
        db.session.commit()
        return 'Column added'
    else:
        return render_template('add_column.html')
    

@app.route('/drop_column', methods=['GET', 'POST'])
def drop_column():
    if request.method == 'POST':
        table_name = request.form.get('table_name')
        column_name = request.form.get('column_name')
        db.session.execute(text(f'ALTER TABLE public.{table_name} DROP COLUMN {column_name}'))
        db.session.commit()
        return f'Column {column_name} dropped from table {table_name}'
    return render_template('drop_column.html')



@app.route('/insert_user', methods=['GET','POST'])
def insert_user():
    if request.method == 'POST':
        username = request.form.get('username')
        age = request.form.get('age')
        db.session.execute(text(f'''
                                    INSERT INTO public.user (username,age) VALUES
                                    ('{username}' , {age})
                                '''))
        db.session.commit()
        return f'Values {username} , {age} added to User table'
    return render_template('insert_user.html')

@login_manager.user_loader
def load_user(user_id):
    try:
        return User.query.get(int(user_id))
    except:
        return None

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']


        if not re.match(r'^(?=.*\d)(?=.*[a-zA-Z]).{8,}$', password):
            flash('Password must be at least 8 characters long and contain both letters and numbers.')
            return redirect(url_for('register'))

        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash('Registration successful. Please log in.')
        return redirect(url_for('login'))

    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        user = User.query.filter_by(email=email).first()

        if user is None or not user.check_password(password):
            flash('Invalid email or password.')
            return redirect(url_for('login'))

        login_user(user)
        return redirect(url_for('dashboard'))

    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')
