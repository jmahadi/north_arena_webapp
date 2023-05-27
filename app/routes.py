from flask import request, render_template
from app import db , app 
from sqlalchemy.sql import text
from models import User 



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
