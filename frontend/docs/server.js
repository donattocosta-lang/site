/**
 * Backend Server for Don IPTV Platform
 * URL: https://api.don-app.com
 * 
 * This file documents all the API routes for the backend server.
 * Copy this to your Node.js Express server.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['https://don-app.com', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.substring(7);
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Get user data from usuarios table
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    // Get user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    req.user = {
      ...userData,
      role: roleData?.role || 'cliente'
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Erro de autenticação' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, senha, nome_completo, telefone } = req.body;

    if (!email || !senha || !nome_completo) {
      return res.status(400).json({ error: 'Email, senha e nome completo são obrigatórios' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true
    });

    if (authError) {
      console.error('Auth error:', authError);
      return res.status(400).json({ error: authError.message });
    }

    // Create user in usuarios table
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        email,
        nome_completo,
        telefone,
        status: 'ativa',
        role: 'cliente'
      })
      .select()
      .single();

    if (userError) {
      console.error('User creation error:', userError);
      // Cleanup: delete auth user if usuarios insert failed
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: 'Erro ao criar usuário' });
    }

    // Create user role
    await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: 'cliente'
      });

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: userData
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (authError) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Get user data
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError) {
      // Create user if not exists
      const { data: newUser, error: createError } = await supabase
        .from('usuarios')
        .insert({
          id: authData.user.id,
          email,
          nome_completo: email.split('@')[0],
          status: 'ativa',
          role: 'cliente'
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
      }

      return res.json({
        token: authData.session.access_token,
        user: { ...newUser, role: 'cliente' }
      });
    }

    // Get user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .single();

    res.json({
      token: authData.session.access_token,
      user: {
        ...userData,
        role: roleData?.role === 'admin' ? 'administrador' : 'cliente'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Update profile
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { nome_completo, telefone } = req.body;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('usuarios')
      .update({ nome_completo, telefone, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar perfil' });
    }

    res.json({ message: 'Perfil atualizado com sucesso', user: data });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Change password
app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;

    // Verify current password by trying to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: senha_atual
    });

    if (verifyError) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      req.user.id,
      { password: nova_senha }
    );

    if (updateError) {
      return res.status(400).json({ error: 'Erro ao alterar senha' });
    }

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// PLANS ROUTES (Public)
// ==========================================

// Get active plans (public)
app.get('/api/planos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .eq('ativo', true)
      .order('preco', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar planos' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// ADMIN PLANS ROUTES
// ==========================================

// Get all plans (admin)
app.get('/api/admin/planos', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar planos' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Admin get plans error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Create plan (admin)
app.post('/api/admin/planos', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { nome, descricao, preco, duracao_dias, recursos, ativo } = req.body;

    const { data, error } = await supabase
      .from('planos')
      .insert({
        nome,
        descricao,
        preco,
        duracao_dias,
        recursos,
        ativo: ativo !== false
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao criar plano' });
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Update plan (admin)
app.put('/api/admin/planos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, preco, duracao_dias, recursos, ativo } = req.body;

    const { data, error } = await supabase
      .from('planos')
      .update({ nome, descricao, preco, duracao_dias, recursos, ativo })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar plano' });
    }

    res.json(data);
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// ORDERS ROUTES (User)
// ==========================================

// Create order
app.post('/api/pedidos', authMiddleware, async (req, res) => {
  try {
    const { plano_id } = req.body;
    const userId = req.user.id;

    // Get plan details
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('*')
      .eq('id', plano_id)
      .eq('ativo', true)
      .single();

    if (planoError || !plano) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    // Create order
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        usuario_id: userId,
        plano_id,
        valor: plano.preco,
        status_pagamento: 'aguardando_pagamento',
        status_acesso: 'inativo'
      })
      .select()
      .single();

    if (pedidoError) {
      return res.status(400).json({ error: 'Erro ao criar pedido' });
    }

    // Here you would integrate with MercadoPago to create payment
    // For now, returning the order with mock payment link

    res.status(201).json({
      ...pedido,
      plano_nome: plano.nome,
      payment_link: `https://mercadopago.com/checkout/${pedido.id}`
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get user orders
app.get('/api/pedidos', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        planos (nome)
      `)
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }

    // Format response
    const formattedData = (data || []).map(pedido => ({
      ...pedido,
      plano_nome: pedido.planos?.nome,
      data_compra: pedido.created_at
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get order details
app.get('/api/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        planos (nome, descricao)
      `)
      .eq('id', id)
      .eq('usuario_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.json({
      ...data,
      plano_nome: data.planos?.nome,
      plano_descricao: data.planos?.descricao
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// ADMIN ORDERS ROUTES
// ==========================================

// Get all orders (admin)
app.get('/api/admin/pedidos', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status_pagamento, status_acesso } = req.query;

    let query = supabase
      .from('pedidos')
      .select(`
        *,
        usuarios (nome_completo, email),
        planos (nome)
      `)
      .order('created_at', { ascending: false });

    if (status_pagamento) {
      query = query.eq('status_pagamento', status_pagamento);
    }
    if (status_acesso) {
      query = query.eq('status_acesso', status_acesso);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }

    const formattedData = (data || []).map(pedido => ({
      ...pedido,
      usuario_nome: pedido.usuarios?.nome_completo,
      usuario_email: pedido.usuarios?.email,
      plano_nome: pedido.planos?.nome,
      data_compra: pedido.created_at
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Admin get orders error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Update order (admin)
app.put('/api/admin/pedidos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status_acesso, observacoes_admin } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (status_acesso) updateData.status_acesso = status_acesso;
    if (observacoes_admin !== undefined) updateData.observacoes_admin = observacoes_admin;

    const { data, error } = await supabase
      .from('pedidos')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar pedido' });
    }

    res.json(data);
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// FREE TRIAL REQUESTS ROUTES
// ==========================================

// Get user's trial requests
app.get('/api/solicitacoes-teste', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('solicitacoes_teste')
      .select('*')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar solicitações' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Get trial requests error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Create trial request
app.post('/api/solicitacoes-teste', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { observacoes } = req.body;

    // Check if user already has a pending or approved request
    const { data: existingRequest } = await supabase
      .from('solicitacoes_teste')
      .select('*')
      .eq('usuario_id', userId)
      .in('status', ['pendente', 'aprovado'])
      .single();

    if (existingRequest) {
      return res.status(400).json({ 
        error: existingRequest.status === 'pendente' 
          ? 'Você já possui uma solicitação pendente' 
          : 'Você já possui um teste aprovado'
      });
    }

    const { data, error } = await supabase
      .from('solicitacoes_teste')
      .insert({
        usuario_id: userId,
        observacoes,
        status: 'pendente'
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao criar solicitação' });
    }

    res.status(201).json({
      message: 'Solicitação de teste grátis criada com sucesso',
      solicitacao: data
    });
  } catch (error) {
    console.error('Create trial request error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// ADMIN FREE TRIAL ROUTES
// ==========================================

// Get all trial requests (admin)
app.get('/api/admin/solicitacoes-teste', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('solicitacoes_teste')
      .select(`
        *,
        usuarios (nome_completo, email, telefone)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar solicitações' });
    }

    const formattedData = (data || []).map(solicitacao => ({
      ...solicitacao,
      usuario_nome: solicitacao.usuarios?.nome_completo,
      usuario_email: solicitacao.usuarios?.email,
      usuario_telefone: solicitacao.usuarios?.telefone
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Admin get trial requests error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Process trial request (admin)
app.put('/api/admin/solicitacoes-teste/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, observacoes_admin } = req.body;

    if (!['aprovado', 'rejeitado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const updateData = {
      status,
      observacoes_admin,
      updated_at: new Date().toISOString()
    };

    if (status === 'aprovado') {
      updateData.aprovado_por = req.user.id;
      updateData.aprovado_em = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('solicitacoes_teste')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao processar solicitação' });
    }

    // Create notification for user
    const { data: solicitacao } = await supabase
      .from('solicitacoes_teste')
      .select('usuario_id')
      .eq('id', id)
      .single();

    if (solicitacao) {
      await supabase
        .from('notificacoes')
        .insert({
          usuario_id: solicitacao.usuario_id,
          titulo: status === 'aprovado' ? 'Teste Grátis Aprovado!' : 'Solicitação de Teste Rejeitada',
          mensagem: status === 'aprovado' 
            ? 'Sua solicitação de teste grátis foi aprovada. Aproveite!' 
            : `Sua solicitação foi rejeitada. ${observacoes_admin || ''}`,
          tipo: status === 'aprovado' ? 'sucesso' : 'info'
        });
    }

    res.json({
      message: `Solicitação ${status === 'aprovado' ? 'aprovada' : 'rejeitada'} com sucesso`,
      solicitacao: data
    });
  } catch (error) {
    console.error('Process trial request error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// NOTIFICATIONS ROUTES
// ==========================================

// Get user notifications
app.get('/api/notificacoes', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar notificações' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Mark notification as read
app.put('/api/notificacoes/:id/lida', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', id)
      .eq('usuario_id', userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao marcar notificação como lida' });
    }

    res.json(data);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// ADMIN USERS ROUTES
// ==========================================

// Get all users (admin)
app.get('/api/admin/usuarios', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, search } = req.query;

    let query = supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`nome_completo.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar usuários' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get user details (admin)
app.get('/api/admin/usuarios/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Get user orders
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('*')
      .eq('usuario_id', id)
      .order('created_at', { ascending: false });

    // Get user trial requests
    const { data: solicitacoes } = await supabase
      .from('solicitacoes_teste')
      .select('*')
      .eq('usuario_id', id)
      .order('created_at', { ascending: false });

    res.json({
      ...usuario,
      pedidos: pedidos || [],
      solicitacoes_teste: solicitacoes || []
    });
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Update user (admin)
app.put('/api/admin/usuarios/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome_completo, telefone, status } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (nome_completo) updateData.nome_completo = nome_completo;
    if (telefone !== undefined) updateData.telefone = telefone;
    if (status) updateData.status = status;

    const { data, error } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erro ao atualizar usuário' });
    }

    res.json(data);
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// ADMIN STATISTICS ROUTES
// ==========================================

app.get('/api/admin/estatisticas', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Get total users
    const { count: totalUsers } = await supabase
      .from('usuarios')
      .select('*', { count: 'exact', head: true });

    // Get active users
    const { count: activeUsers } = await supabase
      .from('usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativa');

    // Get total orders
    const { count: totalOrders } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true });

    // Get paid orders
    const { count: paidOrders } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('status_pagamento', 'pago');

    // Get pending trial requests
    const { count: pendingTrials } = await supabase
      .from('solicitacoes_teste')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente');

    // Get total revenue (sum of paid orders)
    const { data: revenueData } = await supabase
      .from('pedidos')
      .select('valor')
      .eq('status_pagamento', 'pago');

    const totalRevenue = (revenueData || []).reduce((sum, order) => sum + (order.valor || 0), 0);

    res.json({
      usuarios: {
        total: totalUsers || 0,
        ativos: activeUsers || 0
      },
      pedidos: {
        total: totalOrders || 0,
        pagos: paidOrders || 0
      },
      solicitacoes_teste: {
        pendentes: pendingTrials || 0
      },
      receita: {
        total: totalRevenue
      }
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// WEBHOOKS
// ==========================================

// MercadoPago webhook
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    console.log('MercadoPago webhook received:', { type, data });

    if (type === 'payment') {
      const paymentId = data.id;
      
      // Here you would fetch payment details from MercadoPago
      // and update the order status accordingly
      
      // For now, just acknowledge receipt
      console.log('Payment notification for:', paymentId);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API URL: https://api.don-app.com`);
});

module.exports = app;
