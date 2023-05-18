from flask import request, render_template
from app import db,app
from sqlalchemy.sql import text



@app.route('/')
def index():
    return render_template('index.html')

@app.route('/add_column', methods=['GET', 'POST'])
def add_column():
    if request.method == 'POST':
        column_name = request.form.get('column_name')
        column_type = request.form.get('column_type')
        db.session.execute(text(f'ALTER TABLE public.user ADD COLUMN {column_name} {column_type}'))
        db.session.commit()
        return 'Column added'
    else:
        return render_template('add_column.html')
