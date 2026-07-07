-- Demo to-do list (pre-existing demo data, unrelated to the HR portal)
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO todos (title, description, is_completed)
SELECT title, description, is_completed
FROM (
    VALUES
        ('Buy groceries', 'Milk, Bread, Eggs, and Butter', FALSE),
        ('Read a book', 'Finish reading "The Great Gatsby"', FALSE),
        ('Workout', 'Go for a 30-minute run', FALSE)
) AS seed(title, description, is_completed)
WHERE NOT EXISTS (SELECT 1 FROM todos);

-- Users: three hierarchical access tiers, signup-approval workflow
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    tier VARCHAR(10) NOT NULL DEFAULT 'basic'
        CHECK (tier IN ('basic', 'ops', 'master')),
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Demo accounts: basic123 / ops123 / master123
INSERT INTO users (email, name, password_hash, tier, status) VALUES
    ('basic@quorq.com', 'Basic Demo', 'w/OWK4sDOuT+gZbxcWVpiw==:100000:HLEIDJzcmAIJuR5C0PF7mss3hH1BowqDvtYmo7b+LVQ=', 'basic', 'active'),
    ('ops@quorq.com', 'Ops Demo', 'H+Djk0VF6I7uAl8jBCUDJQ==:100000:7I1Lmx6YBzO2vU+MksqgoqhhV4CJ1gxYvoLlgdGJXUg=', 'ops', 'active'),
    ('master@quorq.com', 'Master Demo', 'OPAs0Jo0d0gYo+P2xu4qlA==:100000:BbBSZlY+Z9Oyc5DYVgvD3hbyxrCizXqxhxqg3QQGpC8=', 'master', 'active')
ON CONFLICT (email) DO NOTHING;
