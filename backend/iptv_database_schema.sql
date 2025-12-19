-- =====================================================
-- PLATAFORMA DE REVENDA IPTV - SCHEMA SUPABASE
-- =====================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. TABELA DE USUÁRIOS
-- =====================================================
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (role IN ('cliente', 'administrador')),
    status VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'suspensa')),
    email_verificado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_role ON usuarios(role);
CREATE INDEX idx_usuarios_status ON usuarios(status);

-- =====================================================
-- 2. TABELA DE PLANOS IPTV
-- =====================================================
CREATE TABLE planos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome_comercial VARCHAR(255) NOT NULL,
    descricao TEXT,
    duracao_dias INTEGER NOT NULL,
    preco DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacoes_internas TEXT,
    ordem_exibicao INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_planos_status ON planos(status);
CREATE INDEX idx_planos_ordem ON planos(ordem_exibicao);

-- =====================================================
-- 3. TABELA DE PEDIDOS
-- =====================================================
CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plano_id UUID NOT NULL REFERENCES planos(id),
    valor DECIMAL(10, 2) NOT NULL,
    status_pagamento VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento' 
        CHECK (status_pagamento IN ('aguardando_pagamento', 'pago', 'cancelado', 'reembolsado')),
    status_acesso VARCHAR(30) NOT NULL DEFAULT 'pendente' 
        CHECK (status_acesso IN ('pendente', 'acesso_enviado', 'ativo', 'expirado')),
    
    -- Dados do plano no momento da compra (histórico)
    plano_nome VARCHAR(255) NOT NULL,
    plano_duracao_dias INTEGER NOT NULL,
    
    -- Datas importantes
    data_compra TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_pagamento TIMESTAMP WITH TIME ZONE,
    data_inicio_acesso TIMESTAMP WITH TIME ZONE,
    data_expiracao TIMESTAMP WITH TIME ZONE,
    
    -- Integração Mercado Pago
    mp_payment_id VARCHAR(255),
    mp_preference_id VARCHAR(255),
    mp_status VARCHAR(50),
    
    -- Observações administrativas
    observacoes_admin TEXT,
    credenciais_enviadas_em TIMESTAMP WITH TIME ZONE,
    credenciais_enviadas_por UUID REFERENCES usuarios(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX idx_pedidos_status_pagamento ON pedidos(status_pagamento);
CREATE INDEX idx_pedidos_status_acesso ON pedidos(status_acesso);
CREATE INDEX idx_pedidos_mp_payment ON pedidos(mp_payment_id);
CREATE INDEX idx_pedidos_data_expiracao ON pedidos(data_expiracao);

-- =====================================================
-- 4. TABELA DE NOTIFICAÇÕES
-- =====================================================
CREATE TABLE notificacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    mensagem TEXT NOT NULL,
    lida BOOLEAN DEFAULT FALSE,
    pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notificacoes_usuario ON notificacoes(usuario_id);
CREATE INDEX idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX idx_notificacoes_created ON notificacoes(created_at DESC);

-- =====================================================
-- 5. TABELA DE LOGS DE AUDITORIA
-- =====================================================
CREATE TABLE logs_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    acao VARCHAR(100) NOT NULL,
    entidade VARCHAR(50) NOT NULL,
    entidade_id UUID,
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_logs_usuario ON logs_auditoria(usuario_id);
CREATE INDEX idx_logs_acao ON logs_auditoria(acao);
CREATE INDEX idx_logs_created ON logs_auditoria(created_at DESC);

-- =====================================================
-- 6. TABELA DE CONFIGURAÇÕES DO SISTEMA
-- =====================================================
CREATE TABLE configuracoes (
    chave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    descricao TEXT,
    tipo VARCHAR(20) DEFAULT 'string' CHECK (tipo IN ('string', 'number', 'boolean', 'json')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configurações iniciais
INSERT INTO configuracoes (chave, valor, descricao, tipo) VALUES
('mp_public_key', '', 'Chave pública do Mercado Pago', 'string'),
('mp_access_token', '', 'Access Token do Mercado Pago', 'string'),
('notificacao_email_admin', '', 'E-mail do administrador para notificações', 'string'),
('dias_aviso_expiracao', '7', 'Dias antes da expiração para enviar aviso', 'number');

-- =====================================================
-- 7. TABELA DE MENSAGENS (ÁREA DO CLIENTE)
-- =====================================================
CREATE TABLE mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    remetente_id UUID NOT NULL REFERENCES usuarios(id),
    mensagem TEXT NOT NULL,
    anexo_url TEXT,
    lida BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mensagens_pedido ON mensagens(pedido_id);
CREATE INDEX idx_mensagens_created ON mensagens(created_at DESC);

-- =====================================================
-- TRIGGERS PARA UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON planos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pedidos_updated_at BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION: CALCULAR DATA DE EXPIRAÇÃO
-- =====================================================
CREATE OR REPLACE FUNCTION calcular_data_expiracao()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status_pagamento = 'pago' AND NEW.data_inicio_acesso IS NULL THEN
        NEW.data_inicio_acesso = NOW();
        NEW.data_expiracao = NOW() + (NEW.plano_duracao_dias || ' days')::INTERVAL;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_calcular_expiracao BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION calcular_data_expiracao();

-- =====================================================
-- FUNCTION: CRIAR NOTIFICAÇÃO PARA ADMIN
-- =====================================================
CREATE OR REPLACE FUNCTION notificar_admin_pagamento()
RETURNS TRIGGER AS $$
DECLARE
    admin_id UUID;
BEGIN
    IF NEW.status_pagamento = 'pago' AND OLD.status_pagamento != 'pago' THEN
        -- Busca o primeiro administrador
        SELECT id INTO admin_id FROM usuarios WHERE role = 'administrador' LIMIT 1;
        
        IF admin_id IS NOT NULL THEN
            INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, pedido_id)
            VALUES (
                admin_id,
                'pagamento_confirmado',
                'Novo Pagamento Confirmado',
                'Pedido #' || NEW.id || ' confirmado. Liberar acesso IPTV.',
                NEW.id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_notificar_admin AFTER UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION notificar_admin_pagamento();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS nas tabelas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

-- Policies para usuários
CREATE POLICY "Usuários podem ver seu próprio perfil" ON usuarios
    FOR SELECT USING (auth.uid() = id OR EXISTS (
        SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'administrador'
    ));

CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON usuarios
    FOR UPDATE USING (auth.uid() = id);

-- Policies para pedidos
CREATE POLICY "Clientes veem apenas seus pedidos" ON pedidos
    FOR SELECT USING (
        usuario_id = auth.uid() OR EXISTS (
            SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'administrador'
        )
    );

CREATE POLICY "Apenas clientes podem criar pedidos" ON pedidos
    FOR INSERT WITH CHECK (usuario_id = auth.uid());

-- Policies para notificações
CREATE POLICY "Usuários veem apenas suas notificações" ON notificacoes
    FOR SELECT USING (usuario_id = auth.uid());

-- Policies para mensagens
CREATE POLICY "Acesso a mensagens relacionadas" ON mensagens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pedidos WHERE pedidos.id = mensagens.pedido_id 
            AND (pedidos.usuario_id = auth.uid() OR EXISTS (
                SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'administrador'
            ))
        )
    );

-- =====================================================
-- VIEWS ÚTEIS
-- =====================================================

-- View de pedidos com informações completas
CREATE VIEW vw_pedidos_completos AS
SELECT 
    p.*,
    u.nome_completo as cliente_nome,
    u.email as cliente_email,
    u.telefone as cliente_telefone,
    pl.nome_comercial as plano_nome_atual,
    CASE 
        WHEN p.data_expiracao IS NOT NULL AND p.data_expiracao < NOW() THEN 'expirado'
        WHEN p.status_acesso = 'ativo' THEN 'ativo'
        ELSE p.status_acesso
    END as status_real
FROM pedidos p
JOIN usuarios u ON p.usuario_id = u.id
JOIN planos pl ON p.plano_id = pl.id;

-- View de estatísticas para dashboard
CREATE VIEW vw_estatisticas_vendas AS
SELECT 
    COUNT(*) as total_vendas,
    SUM(CASE WHEN status_pagamento = 'pago' THEN valor ELSE 0 END) as receita_total,
    COUNT(CASE WHEN status_pagamento = 'aguardando_pagamento' THEN 1 END) as pagamentos_pendentes,
    COUNT(CASE WHEN status_pagamento = 'pago' AND status_acesso = 'pendente' THEN 1 END) as acessos_pendentes
FROM pedidos
WHERE data_compra >= DATE_TRUNC('month', NOW());

-- =====================================================
-- DADOS INICIAIS
-- =====================================================

-- Criar usuário administrador padrão (ALTERAR SENHA EM PRODUÇÃO!)
INSERT INTO usuarios (nome_completo, email, role, status, email_verificado) 
VALUES ('Administrador', 'admin@iptv.com', 'administrador', 'ativa', true);

-- Planos de exemplo
INSERT INTO planos (nome_comercial, descricao, duracao_dias, preco, status, ordem_exibicao) VALUES
('Plano Mensal', 'Acesso completo por 30 dias', 30, 29.90, 'ativo', 1),
('Plano Trimestral', 'Acesso completo por 90 dias - Economize 15%', 90, 74.90, 'ativo', 2),
('Plano Semestral', 'Acesso completo por 180 dias - Economize 25%', 180, 134.90, 'ativo', 3),
('Plano Anual', 'Acesso completo por 365 dias - Melhor oferta!', 365, 239.90, 'ativo', 4);

COMMENT ON TABLE usuarios IS 'Tabela de usuários do sistema (clientes e administradores)';
COMMENT ON TABLE planos IS 'Planos IPTV disponíveis para venda';
COMMENT ON TABLE pedidos IS 'Pedidos e assinaturas dos clientes';
COMMENT ON TABLE notificacoes IS 'Sistema de notificações internas';
COMMENT ON TABLE logs_auditoria IS 'Registro de todas as ações importantes do sistema';
COMMENT ON TABLE mensagens IS 'Mensagens entre admin e cliente sobre pedidos específicos';