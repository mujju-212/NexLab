"""
Unified AI Harness & Copilot Models:
- AdminChatSession (aliased as AIConversation): Threaded multi-role conversation sessions
  with rolling compact_memory and live page_context across all 5 roles
  (student, free_user, instructor, institution_admin, admin).
- AdminChatMessage (aliased as AIMessage): Individual messages with tool_calls,
  pending_action confirmation payloads, RAG sources, generated_doc metadata,
  and socratic_filtered audit flag.
- InstitutionDocument: Scoped multi-format RAG document index
  (institution, course, section, user scopes; pdf, docx, xlsx, csv, md, txt).
- AIGeneratedDocument: On-demand generated study sheets, flashcards, cheat sheets,
  and analytical reports (.pdf, .xlsx, .csv, .md).
"""
import uuid
from datetime import datetime, timedelta
from app.extensions import db


class AdminChatSession(db.Model):
    """
    Threaded conversation session between any authenticated user (all 5 roles)
    and the NexLab AI Harness.
    Retains __tablename__ = 'admin_chat_sessions' for 100% backward compatibility
    with existing Institution Admin threads while supporting role_scope,
    rolling compact_memory, and live page_context.
    """
    __tablename__ = 'admin_chat_sessions'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=True, index=True)
    user_id        = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    role_scope     = db.Column(db.String(30), default='institution_admin', index=True)  # student | free_user | instructor | institution_admin | admin
    title          = db.Column(db.String(255), default='New Conversation')
    mode           = db.Column(db.String(20), default='chat')  # 'chat' | 'agent'
    is_pinned      = db.Column(db.Boolean, default=False)
    compact_memory = db.Column(db.Text, nullable=True)         # Rolling auto-compacted summary of older turns
    page_context   = db.Column(db.JSON, default=dict)          # Live UI context: {route, section_id, experiment_id, session_id, problem_id}
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
            'role_scope': self.role_scope or 'institution_admin',
            'title': self.title,
            'mode': self.mode,
            'is_pinned': self.is_pinned,
            'compact_memory': self.compact_memory,
            'page_context': self.page_context or {},
            'message_count': msg_count,
            'last_message': last_msg,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AdminChatMessage(db.Model):
    """
    Individual message inside an AdminChatSession / AIConversation.
    Preserves role, tool execution observations, pending actions, RAG sources,
    generated document attachments, and Socratic guardrail status.
    """
    __tablename__ = 'admin_chat_messages'

    id                = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id        = db.Column(db.String(36), db.ForeignKey('admin_chat_sessions.id', ondelete='CASCADE'), nullable=False, index=True)
    role              = db.Column(db.String(20), nullable=False)  # 'user' | 'assistant' | 'system'
    content           = db.Column(db.Text, nullable=False)
    mode              = db.Column(db.String(20), default='chat')  # 'chat' | 'agent'
    tool_calls        = db.Column(db.JSON, default=list)          # list of {tool, args, result, error}
    pending_action    = db.Column(db.JSON, nullable=True)         # structured action proposal awaiting confirmation
    sources           = db.Column(db.JSON, default=list)          # citations: document chunks or web search results
    generated_doc     = db.Column(db.JSON, nullable=True)         # optional {id, title, format, download_url}
    socratic_filtered = db.Column(db.Boolean, default=False)      # True if deterministic Socratic filter stripped solution code
    total_tokens      = db.Column(db.Integer, default=0)
    created_at        = db.Column(db.DateTime, default=datetime.utcnow, index=True)

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
            'generated_doc': self.generated_doc,
            'socratic_filtered': bool(self.socratic_filtered),
            'total_tokens': self.total_tokens,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class InstitutionDocument(db.Model):
    """
    Uploaded documents (PDF, DOCX, XLSX, CSV, Markdown, TXT) indexed for
    scoped RAG similarity retrieval across institution, course, section, or user scopes.
    """
    __tablename__ = 'institution_documents'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=True, index=True)
    uploaded_by    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    scope_type     = db.Column(db.String(30), default='institution', index=True)  # 'institution' | 'course' | 'section' | 'user'
    scope_id       = db.Column(db.String(36), nullable=True, index=True)          # subject_id, section_id, or user_id
    doc_type       = db.Column(db.String(20), default='pdf')                      # 'pdf' | 'docx' | 'xlsx' | 'csv' | 'md' | 'txt'
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
            'scope_type': self.scope_type or 'institution',
            'scope_id': self.scope_id,
            'doc_type': self.doc_type or 'pdf',
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


class AIGeneratedDocument(db.Model):
    """
    On-demand documents generated by the AI Harness:
    - Student revision study sheets, concept flashcards, viva prep sheets
    - Free-learner personalized study plans & cheat sheets
    - Instructor section reports, rubrics, and experiment handouts
    - Admin executive briefings, NAAC/NBA accreditation tables, and exports
    """
    __tablename__ = 'ai_generated_documents'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id         = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=True, index=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey('admin_chat_sessions.id', ondelete='SET NULL'), nullable=True, index=True)
    title           = db.Column(db.String(255), nullable=False)
    format          = db.Column(db.String(16), nullable=False, default='md')  # 'pdf' | 'xlsx' | 'csv' | 'md'
    file_path       = db.Column(db.String(512), nullable=True)
    content_text    = db.Column(db.Text, nullable=True)
    file_size_bytes = db.Column(db.Integer, default=0)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    expires_at      = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(days=7))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'institution_id': self.institution_id,
            'conversation_id': self.conversation_id,
            'title': self.title,
            'format': self.format,
            'file_path': self.file_path,
            'file_size_bytes': self.file_size_bytes,
            'download_url': f"/api/ai/generated-docs/{self.id}/download",
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
        }


# Clean aliases matching NEXLAB_AI_HARNESS_OVERVIEW.md terminology
AIConversation = AdminChatSession
AIMessage = AdminChatMessage
