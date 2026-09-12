import uuid
from datetime import datetime
from app.extensions import db


class Invoice(db.Model):
    __tablename__ = 'invoices'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    invoice_number  = db.Column(db.String(50), nullable=False, unique=True, index=True)
    amount          = db.Column(db.Float, nullable=False, default=4999.0)
    currency        = db.Column(db.String(10), default='₹')
    plan            = db.Column(db.String(50), default='NexLab Pro')
    billing_date    = db.Column(db.DateTime, default=datetime.utcnow)
    status          = db.Column(db.String(20), default='paid')  # paid | pending | failed
    payment_method  = db.Column(db.String(50), default='VISA •••• 4242')
    items_json      = db.Column(db.Text)  # JSON breakdown of line items
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        items = []
        if self.items_json:
            try:
                items = json.loads(self.items_json)
            except Exception:
                items = []

        date_str = self.billing_date.strftime('%d %b %Y') if self.billing_date else ''
        return {
            'id':             self.id,
            'institution_id': self.institution_id,
            'invoice_number': self.invoice_number,
            'amount':         self.amount,
            'amount_formatted': f"{self.currency}{int(self.amount):,}" if self.currency else f"{self.amount}",
            'currency':       self.currency,
            'plan':           self.plan,
            'billing_date':   self.billing_date.isoformat() if self.billing_date else None,
            'date':           date_str,
            'status':         self.status,
            'payment_method': self.payment_method,
            'items':          items,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
        }


class PaymentMethod(db.Model):
    __tablename__ = 'payment_methods'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    card_brand      = db.Column(db.String(30), default='VISA')  # VISA | Mastercard | RuPay | Amex
    last4           = db.Column(db.String(4), nullable=False)   # e.g. "4242"
    exp_month       = db.Column(db.Integer, nullable=False)     # 1-12
    exp_year        = db.Column(db.Integer, nullable=False)     # e.g. 2028
    cardholder_name = db.Column(db.String(100), default='Institution Admin')
    is_default      = db.Column(db.Boolean, default=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        exp_month_str = str(self.exp_month).zfill(2)
        return {
            'id':              self.id,
            'institution_id':  self.institution_id,
            'card_brand':      self.card_brand,
            'brand':           self.card_brand,
            'last4':           self.last4,
            'exp_month':       self.exp_month,
            'exp_year':        self.exp_year,
            'expiry':          f"{exp_month_str}/{self.exp_year}",
            'cardholder_name': self.cardholder_name,
            'is_default':      self.is_default,
            'created_at':      self.created_at.isoformat() if self.created_at else None,
        }
