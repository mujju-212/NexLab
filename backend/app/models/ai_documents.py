"""
AI Harness Document Chunk Model — pgvector-backed RAG storage.

Extends the document index (institution_documents) with a per-chunk vector store
so semantic similarity search is possible. The `embedding` column is a pgvector
`VECTOR(dim)` when pgvector is importable; otherwise it degrades to a plain JSON
list so the feature still works (via NumPy cosine in Python) without the package.

HAS_PGVECTOR is the module flag callers check before issuing pgvector queries.
"""
import uuid
from datetime import datetime

from app.extensions import db

try:
    from pgvector.sqlalchemy import Vector
    _HAS_PGVECTOR = True
except Exception:  # pragma: no cover - pgvector not installed
    _HAS_PGVECTOR = False
    Vector = object  # type: ignore

HAS_PGVECTOR = _HAS_PGVECTOR
EMBEDDING_DIM = 768  # Google text-embedding-004 dimension


class DocumentChunk(db.Model):
    __tablename__ = 'ai_document_chunks'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id    = db.Column(db.String(36), db.ForeignKey('institution_documents.id', ondelete='CASCADE'), nullable=False, index=True)
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=True, index=True)
    scope_type     = db.Column(db.String(30), default='institution', index=True)
    scope_id       = db.Column(db.String(36), nullable=True, index=True)
    chunk_index    = db.Column(db.Integer, default=0)
    chunk_id       = db.Column(db.String(255), nullable=False, index=True)
    text           = db.Column(db.Text, nullable=False)
    page           = db.Column(db.Integer, nullable=True)
    embedding      = db.Column(Vector(EMBEDDING_DIM) if _HAS_PGVECTOR else db.JSON, nullable=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    # Always-safe composite index; pgvector ivfflat appended only when available.
    __table_args__ = (
        db.Index('ix_ai_chunks_scope', 'institution_id', 'scope_type', 'scope_id'),
    )
    if _HAS_PGVECTOR:
        __table_args__ += (
            db.Index('ix_ai_chunks_embedding', 'embedding',
                     postgresql_using='ivfflat',
                     postgresql_ops={'embedding': 'vector_cosine_ops'}),
        )

    def to_dict(self, include_vector: bool = False):
        out = {
            'id': self.id,
            'document_id': self.document_id,
            'institution_id': self.institution_id,
            'scope_type': self.scope_type or 'institution',
            'scope_id': self.scope_id,
            'chunk_index': self.chunk_index,
            'chunk_id': self.chunk_id,
            'text': self.text,
            'page': self.page,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_vector and self.embedding is not None:
            out['embedding'] = list(self.embedding) if not hasattr(self.embedding, 'tolist') else self.embedding.tolist()
        return out