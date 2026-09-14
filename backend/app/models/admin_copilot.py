"""
Admin AI Copilot Models: Chat Sessions, Messages, and Uploaded Documents for RAG.
"""
import uuid
from datetime import datetime
from app.extensions import db


class AdminChatSession(db.Model):
    """
    Threaded conversation session between an Institution Admin and the AI Copilot.
    Supports switching between threads and persistent history.
    """
    __tablename__ = 'admin_chat_sessions'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    user_id        = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    title          = db.Column(db.String(255), default='New Conversation')
    mode           = db.Column(db.String(20), default='chat')  # 'chat' | 'agent'
    is_pinned      = db.Column(db.Boolean, default=False)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    messages       = db.relationship('AdminChatMessage', backref='session', lazy='dynamic',
                                     cascade='all, delete-orphan', order_by='AdminChatMessage.created_at.asc()')

    def to_dict(self, include_last_message: bool = True):
        last_msg = None
        msg_count = self.messages.count()
        if include_last_message and msg_count > 0:
            last = self.messages.order_by(AdminChatMessage.created_at.desc()).first()
            if last:
                last_msg = {
                    'id': last.id,
                    'role': last.role,
                    'content': (last.content or '')[:120],
                    'created_at': last.created_at.isoformat() if last.created_at else None,
                }

        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'user_id': self.user_id,
            'title': self.title,
            'mode': self.mode,
            'is_pinned': self.is_pinned,
            'message_count': msg_count,
            'last_message': last_msg,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AdminChatMessage(db.Model):
    """
    Individual message inside an AdminChatSession.
    Preserves role, tool execution observations, pending actions, and RAG sources.
    """
    __tablename__ = 'admin_chat_messages'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id     = db.Column(db.String(36), db.ForeignKey('admin_chat_sessions.id', ondelete='CASCADE'), nullable=False, index=True)
    role           = db.Column(db.String(20), nullable=False)  # 'user' | 'assistant' | 'system'
    content        = db.Column(db.Text, nullable=False)
    mode           = db.Column(db.String(20), default='chat')  # 'chat' | 'agent'
    tool_calls     = db.Column(db.JSON, default=list)          # list of {tool, args, result, error}
    pending_action = db.Column(db.JSON, nullable=True)         # structured action proposal awaiting confirmation
    sources        = db.Column(db.JSON, default=list)          # citations: PDF chunks or web search results
    total_tokens   = db.Column(db.Integer, default=0)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'mode': self.mode,
            'tool_calls': self.tool_calls or [],
            'pending_action': self.pending_action,
            'sources': self.sources or [],
            'total_tokens': self.total_tokens,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class InstitutionDocument(db.Model):
    """
    Uploaded PDF documents (syllabi, guidelines, circulars, lab policies)
    indexed for RAG similarity retrieval.
    """
    __tablename__ = 'institution_documents'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    uploaded_by    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    filename       = db.Column(db.String(255), nullable=False)
    file_path      = db.Column(db.String(512), nullable=False)
    file_size      = db.Column(db.Integer, default=0)
    page_count     = db.Column(db.Integer, default=0)
    chunks         = db.Column(db.JSON, default=list)          # list of {chunk_id, page, text, tokens}
    status         = db.Column(db.String(20), default='indexed') # 'indexed' | 'processing' | 'error'
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self, include_chunks: bool = False):
        out = {
            'id': self.id,
            'institution_id': self.institution_id,
            'uploaded_by': self.uploaded_by,
            'filename': self.filename,
            'file_size': self.file_size,
            'page_count': self.page_count,
            'chunk_count': len(self.chunks) if self.chunks else 0,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_chunks:
            out['chunks'] = self.chunks or []
        return out
