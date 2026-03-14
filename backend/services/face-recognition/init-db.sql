-- Initialize PhotoPro Database with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE photopro TO photopro;

-- Create faces table
CREATE TABLE IF NOT EXISTS faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL,
    face_id VARCHAR(50) UNIQUE NOT NULL,
    aws_face_id VARCHAR(100) UNIQUE,
    embedding vector(512) NOT NULL,
    thumbnail_url VARCHAR(500),
    confidence FLOAT NOT NULL DEFAULT 0.0,
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    photo_count INTEGER NOT NULL DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_faces_business_id ON faces(business_id);
CREATE INDEX idx_faces_face_id ON faces(face_id);

-- Create HNSW index for fast vector similarity search
-- HNSW is faster than IVFFlat for most use cases
CREATE INDEX idx_faces_embedding_hnsw ON faces 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (if HNSW not available)
-- CREATE INDEX idx_faces_embedding_ivfflat ON faces 
--     USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);

-- Create photo_faces table
CREATE TABLE IF NOT EXISTS photo_faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL,
    face_id UUID NOT NULL REFERENCES faces(id) ON DELETE CASCADE,
    bounding_box JSONB NOT NULL,
    confidence FLOAT NOT NULL DEFAULT 0.0,
    landmarks JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(photo_id, face_id)
);

-- Create indexes for photo_faces
CREATE INDEX idx_photo_faces_photo_id ON photo_faces(photo_id);
CREATE INDEX idx_photo_faces_face_id ON photo_faces(face_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for faces table
CREATE TRIGGER update_faces_updated_at
    BEFORE UPDATE ON faces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate cosine similarity
CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
RETURNS FLOAT AS $$
BEGIN
    RETURN 1 - (a <=> b);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

COMMENT ON FUNCTION cosine_similarity IS 'Calculate cosine similarity between two vectors (returns 0-1)';

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO photopro;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO photopro;
