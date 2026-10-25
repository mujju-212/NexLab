import uuid
from datetime import datetime
from app.extensions import db


class FAQArticle(db.Model):
    __tablename__ = 'faq_articles'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    category        = db.Column(db.String(50), nullable=False, index=True)
    category_title  = db.Column(db.String(100), nullable=False)
    question        = db.Column(db.Text, nullable=False)
    answer          = db.Column(db.Text, nullable=False)
    helpful_count   = db.Column(db.Integer, default=0)
    unhelpful_count = db.Column(db.Integer, default=0)
    is_published    = db.Column(db.Boolean, default=True)
    order           = db.Column(db.Integer, default=0)
    tags            = db.Column(db.Text)  # JSON list of search keywords
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        tag_list = []
        if self.tags:
            try:
                tag_list = json.loads(self.tags)
            except Exception:
                tag_list = []

        return {
            'id':              self.id,
            'category':        self.category,
            'category_title':  self.category_title,
            'question':        self.question,
            'answer':          self.answer,
            'helpful_count':   self.helpful_count or 0,
            'unhelpful_count': self.unhelpful_count or 0,
            'is_published':    self.is_published,
            'order':           self.order,
            'tags':            tag_list,
            'created_at':      self.created_at.isoformat() if self.created_at else None,
        }


class SupportTicket(db.Model):
    __tablename__ = 'support_tickets'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_number   = db.Column(db.String(50), unique=True, nullable=False, index=True)
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    user_id         = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    subject         = db.Column(db.String(255), nullable=False)
    category        = db.Column(db.String(50), default='general')  # technical | billing | academic | general
    priority        = db.Column(db.String(20), default='medium')   # low | medium | high | urgent
    message         = db.Column(db.Text, nullable=False)
    status          = db.Column(db.String(20), default='open')     # open | in_progress | resolved
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        date_str = self.created_at.strftime('%d %b %Y, %I:%M %p') if self.created_at else ''
        return {
            'id':             self.id,
            'ticket_number':  self.ticket_number,
            'institution_id': self.institution_id,
            'user_id':        self.user_id,
            'subject':        self.subject,
            'category':       self.category,
            'priority':       self.priority,
            'message':        self.message,
            'status':         self.status,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
            'formatted_date': date_str,
        }
