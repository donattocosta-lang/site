-- =====================================================
-- QUERIES ÚTEIS - PLATAFORMA REVENDA IPTV
-- =====================================================

-- =====================================================
-- 1. RELATÓRIOS E ESTATÍSTICAS
-- =====================================================

-- Vendas do mês atual
SELECT 
    COUNT(*) as total_vendas,
    SUM(valor) as receita_total,
    AVG(valor) as ticket_medio,
    COUNT(DISTINCT usuario_id) as clientes_unicos
FROM pedidos
WHERE status_pagamento = 'pago'
AND DATE_TRUNC('month', data_pagamento) = DATE_TRUNC('month', NOW());

-- Top 5 planos mais vendidos
SELECT 
    p.nome_comercial,
    COUNT(pe.id) as quantidade_vendida,
    SUM(pe.valor) as receita_total
FROM pedidos pe
JOIN planos p ON pe.plano_id = p.id
WHERE pe.status_pagamento = 'pago'
GROUP BY p.id, p.nome_comercial
ORDER BY quantidade_vendida DESC
LIMIT 5;

-- Taxa de conversão (pedidos pagos vs criados)
SELECT 
    COUNT(*) as total_pedidos,
    COUNT(CASE WHEN status_pagamento = 'pago' THEN 1 END) as pedidos_pagos,
    ROUND(
        (COUNT(CASE WHEN status_pagamento = 'pago' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 
        2
    ) as taxa_conversao_percentual
FROM pedidos
WHERE created_at >= NOW() - INTERVAL '30 days';

-- Pedidos pendentes de liberação
SELECT 
    pe.id,
    pe.created_at,
    pe.valor,
    pe.plano_nome,
    u.nome_completo,
    u.email,
    u.telefone,
    EXTRACT(HOUR FROM (NOW() - pe.data_pagamento)) as horas_desde_pagamento
FROM pedidos pe
JOIN usuarios u ON pe.usuario_id = u.id
WHERE pe.status_pagamento = 'pago'
AND pe.status_acesso = 'pendente'
ORDER BY pe.data_pagamento ASC;

-- Acessos que expiram nos próximos 7 dias
SELECT 
    pe.id,
    pe.data_expiracao,
    pe.plano_nome,
    u.nome_completo,
    u.email,
    EXTRACT(DAY FROM (pe.data_expiracao - NOW())) as dias_restantes
FROM pedidos pe
JOIN usuarios u ON pe.usuario_id = u.id
WHERE pe.status_acesso = 'ativo'
AND pe.data_expiracao BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY pe.data_expiracao ASC;

-- Receita por período (último ano, agrupado por mês)
SELECT 
    TO_CHAR(data_pagamento, 'YYYY-MM') as mes,
    COUNT(*) as total_vendas,
    SUM(valor) as receita
FROM pedidos
WHERE status_pagamento = 'pago'
AND data_pagamento >= NOW() - INTERVAL '12 months'
GROUP BY TO_CHAR(data_pagamento, 'YYYY-MM')
ORDER BY mes DESC;

-- Clientes mais ativos (maior número de renovações)
SELECT 
    u.id,
    u.nome_completo,
    u.email,
    COUNT(pe.id) as total_compras,
    SUM(pe.valor) as valor_total_gasto,
    MAX(pe.created_at) as ultima_compra
FROM usuarios u
JOIN pedidos pe ON u.id = pe.usuario_id
WHERE pe.status_pagamento = 'pago'
GROUP BY u.id, u.nome_completo, u.email
HAVING COUNT(pe.id) > 1
ORDER BY total_compras DESC
LIMIT 20;

-- =====================================================
-- 2. FUNÇÕES ADMINISTRATIVAS
-- =====================================================

-- Função para expirar acessos automaticamente
CREATE OR REPLACE FUNCTION expirar_acessos_vencidos()
RETURNS INTEGER AS $$
DECLARE
    registros_atualizados INTEGER;
BEGIN
    UPDATE pedidos
    SET status_acesso = 'expirado'
    WHERE status_acesso = 'ativo'
    AND data_expiracao < NOW();
    
    GET DIAGNOSTICS registros_atualizados = ROW_COUNT;
    RETURN registros_atualizados;
END;
$$ LANGUAGE plpgsql;

-- Executar manualmente:
-- SELECT expirar_acessos_vencidos();

-- Função para gerar relatório mensal completo
CREATE OR REPLACE FUNCTION relatorio_mensal(mes INTEGER, ano INTEGER)
RETURNS TABLE (
    total_vendas BIGINT,
    receita_total NUMERIC,
    novos_clientes BIGINT,
    renovacoes BIGINT,
    ticket_medio NUMERIC,
    taxa_conversao NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH dados_mes AS (
        SELECT 
            pe.id,
            pe.valor,
            pe.usuario_id,
            pe.status_pagamento,
            pe.created_at,
            COUNT(*) OVER (PARTITION BY pe.usuario_id) as compras_usuario
        FROM pedidos pe
        WHERE EXTRACT(MONTH FROM pe.created_at) = mes
        AND EXTRACT(YEAR FROM pe.created_at) = ano
    )
    SELECT 
        COUNT(CASE WHEN status_pagamento = 'pago' THEN 1 END)::BIGINT,
        SUM(CASE WHEN status_pagamento = 'pago' THEN valor ELSE 0 END)::NUMERIC,
        COUNT(DISTINCT CASE WHEN status_pagamento = 'pago' AND compras_usuario = 1 THEN usuario_id END)::BIGINT,
        COUNT(DISTINCT CASE WHEN status_pagamento = 'pago' AND compras_usuario > 1 THEN usuario_id END)::BIGINT,
        AVG(CASE WHEN status_pagamento = 'pago' THEN valor END)::NUMERIC,
        ROUND(
            (COUNT(CASE WHEN status_pagamento = 'pago' THEN 1 END)::NUMERIC / 
            COUNT(*)::NUMERIC) * 100, 
            2
        )::NUMERIC
    FROM dados_mes;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM relatorio_mensal(12, 2024);

-- Função para listar clientes inativos (sem compras há X dias)
CREATE OR REPLACE FUNCTION clientes_inativos(dias_inatividade INTEGER DEFAULT 90)
RETURNS TABLE (
    usuario_id UUID,
    nome_completo VARCHAR,
    email VARCHAR,
    telefone VARCHAR,
    ultima_compra TIMESTAMP WITH TIME ZONE,
    dias_sem_comprar INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.nome_completo,
        u.email,
        u.telefone,
        MAX(pe.created_at) as ultima_compra,
        EXTRACT(DAY FROM NOW() - MAX(pe.created_at))::INTEGER as dias_sem_comprar
    FROM usuarios u
    JOIN pedidos pe ON u.id = pe.usuario_id
    WHERE u.role = 'cliente'
    AND pe.status_pagamento = 'pago'
    GROUP BY u.id, u.nome_completo, u.email, u.telefone
    HAVING MAX(pe.created_at) < NOW() - (dias_inatividade || ' days')::INTERVAL
    ORDER BY ultima_compra ASC;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM clientes_inativos(60);

-- =====================================================
-- 3. PROCEDURES PARA MANUTENÇÃO
-- =====================================================

-- Limpar notificações antigas (mais de 90 dias)
CREATE OR REPLACE PROCEDURE limpar_notificacoes_antigas()
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM notificacoes
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND lida = true;
    
    RAISE NOTICE 'Notificações antigas removidas';
END;
$$;

-- Executar: CALL limpar_notificacoes_antigas();

-- Arquivar logs de auditoria antigos
CREATE TABLE IF NOT EXISTS logs_auditoria_arquivo (LIKE logs_auditoria);

CREATE OR REPLACE PROCEDURE arquivar_logs_antigos()
LANGUAGE plpgsql
AS $$
BEGIN
    -- Mover logs com mais de 1 ano para tabela de arquivo
    INSERT INTO logs_auditoria_arquivo
    SELECT * FROM logs_auditoria
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Deletar logs movidos
    DELETE FROM logs_auditoria
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    RAISE NOTICE 'Logs arquivados com sucesso';
END;
$$;

-- =====================================================
-- 4. VIEWS ADICIONAIS ÚTEIS
-- =====================================================

-- View de churn (clientes que não renovaram)
CREATE OR REPLACE VIEW vw_churn_clientes AS
SELECT 
    u.id,
    u.nome_completo,
    u.email,
    u.telefone,
    MAX(pe.data_expiracao) as ultima_expiracao,
    EXTRACT(DAY FROM NOW() - MAX(pe.data_expiracao))::INTEGER as dias_sem_acesso,
    COUNT(pe.id) as total_compras_historico
FROM usuarios u
JOIN pedidos pe ON u.id = pe.usuario_id
WHERE pe.status_pagamento = 'pago'
AND pe.status_acesso = 'expirado'
GROUP BY u.id, u.nome_completo, u.email, u.telefone
HAVING MAX(pe.data_expiracao) < NOW() - INTERVAL '30 days'
ORDER BY ultima_expiracao DESC;

-- View de LTV (Lifetime Value) por cliente
CREATE OR REPLACE VIEW vw_ltv_clientes AS
SELECT 
    u.id,
    u.nome_completo,
    u.email,
    COUNT(pe.id) as total_compras,
    SUM(pe.valor) as valor_total_gasto,
    AVG(pe.valor) as ticket_medio,
    MIN(pe.created_at) as primeira_compra,
    MAX(pe.created_at) as ultima_compra,
    EXTRACT(DAY FROM MAX(pe.created_at) - MIN(pe.created_at))::INTEGER as dias_cliente
FROM usuarios u
JOIN pedidos pe ON u.id = pe.usuario_id
WHERE pe.status_pagamento = 'pago'
GROUP BY u.id, u.nome_completo, u.email
ORDER BY valor_total_gasto DESC;

-- View de performance por plano
CREATE OR REPLACE VIEW vw_performance_planos AS
SELECT 
    p.id,
    p.nome_comercial,
    p.preco,
    p.duracao_dias,
    COUNT(pe.id) as total_vendas,
    SUM(pe.valor) as receita_total,
    ROUND(AVG(EXTRACT(DAY FROM pe.data_expiracao - pe.data_inicio_acesso)), 0) as duracao_media_uso,
    COUNT(CASE WHEN pe.status_acesso = 'ativo' THEN 1 END) as assinaturas_ativas,
    COUNT(CASE WHEN pe.status_acesso = 'expirado' THEN 1 END) as assinaturas_expiradas
FROM planos p
LEFT JOIN pedidos pe ON p.id = pe.plano_id AND pe.status_pagamento = 'pago'
GROUP BY p.id, p.nome_comercial, p.preco, p.duracao_dias
ORDER BY receita_total DESC NULLS LAST;

-- =====================================================
-- 5. ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================

-- Índices compostos para queries comuns
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_status ON pedidos(usuario_id, status_pagamento);
CREATE INDEX IF NOT EXISTS idx_pedidos_data_pagamento ON pedidos(data_pagamento DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_expiracao_status ON pedidos(data_expiracao, status_acesso);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_lida ON notificacoes(usuario_id, lida);

-- =====================================================
-- 6. TRIGGERS ADICIONAIS
-- =====================================================

-- Trigger para prevenir deleção de pedidos pagos
CREATE OR REPLACE FUNCTION prevenir_delecao_pedidos_pagos()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status_pagamento = 'pago' THEN
        RAISE EXCEPTION 'Não é permitido deletar pedidos com status pago';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevenir_delecao
BEFORE DELETE ON pedidos
FOR EACH ROW EXECUTE FUNCTION prevenir_delecao_pedidos_pagos();

-- Trigger para registrar alterações em planos
CREATE OR REPLACE FUNCTION registrar_alteracao_plano()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO logs_auditoria (
        acao,
        entidade,
        entidade_id,
        dados_anteriores,
        dados_novos
    ) VALUES (
        'alteracao_plano',
        'planos',
        NEW.id,
        row_to_json(OLD),
        row_to_json(NEW)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_alteracao_plano
AFTER UPDATE ON planos
FOR EACH ROW EXECUTE FUNCTION registrar_alteracao_plano();

-- =====================================================
-- 7. CONSULTAS DE MONITORAMENTO
-- =====================================================

-- Verificar saúde do sistema
SELECT 
    'Total de Usuários' as metrica,
    COUNT(*) as valor
FROM usuarios
UNION ALL
SELECT 
    'Pedidos Aguardando Pagamento',
    COUNT(*)
FROM pedidos
WHERE status_pagamento = 'aguardando_pagamento'
UNION ALL
SELECT 
    'Acessos Pendentes de Liberação',
    COUNT(*)
FROM pedidos
WHERE status_pagamento = 'pago' AND status_acesso = 'pendente'
UNION ALL
SELECT 
    'Assinaturas Ativas',
    COUNT(*)
FROM pedidos
WHERE status_acesso = 'ativo'
UNION ALL
SELECT 
    'Notificações Não Lidas',
    COUNT(*)
FROM notificacoes
WHERE lida = false;

-- Performance das queries (tempo de execução)
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE query LIKE '%pedidos%'
ORDER BY mean_time DESC
LIMIT 10;

-- Tamanho das tabelas
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;