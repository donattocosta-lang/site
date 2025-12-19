// =====================================================
// MERCADO PAGO INTEGRATION - mercadopago.service.js
// =====================================================

const mercadopago = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

class MercadoPagoService {
  /**
   * Criar preferência de pagamento
   */
  async criarPreferencia(pedido, usuario) {
    try {
      const preference = {
        items: [
          {
            title: pedido.plano_nome,
            description: `Acesso IPTV por ${pedido.plano_duracao_dias} dias`,
            unit_price: parseFloat(pedido.valor),
            quantity: 1,
            currency_id: 'BRL'
          }
        ],
        payer: {
          name: usuario.nome_completo,
          email: usuario.email,
          phone: {
            number: usuario.telefone || ''
          }
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pagamento/sucesso`,
          failure: `${process.env.FRONTEND_URL}/pagamento/falha`,
          pending: `${process.env.FRONTEND_URL}/pagamento/pendente`
        },
        auto_return: 'approved',
        external_reference: pedido.id,
        notification_url: `${process.env.BACKEND_URL}/api/webhooks/mercadopago`,
        statement_descriptor: 'IPTV REVENDA',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
      };

      const response = await mercadopago.preferences.create(preference);

      // Atualizar pedido com preference_id
      await supabase
        .from('pedidos')
        .update({
          mp_preference_id: response.body.id
        })
        .eq('id', pedido.id);

      return {
        preference_id: response.body.id,
        init_point: response.body.init_point, // URL para redirect
        sandbox_init_point: response.body.sandbox_init_point
      };
    } catch (error) {
      console.error('Erro ao criar preferência MP:', error);
      throw error;
    }
  }

  /**
   * Processar notificação de pagamento
   */
  async processarNotificacao(paymentId) {
    try {
      // Buscar informações do pagamento
      const payment = await mercadopago.payment.findById(paymentId);
      
      const external_reference = payment.body.external_reference;
      const status = payment.body.status;

      // Mapear status do MP para status do sistema
      let statusPagamento;
      switch (status) {
        case 'approved':
          statusPagamento = 'pago';
          break;
        case 'rejected':
        case 'cancelled':
          statusPagamento = 'cancelado';
          break;
        case 'refunded':
          statusPagamento = 'reembolsado';
          break;
        default:
          statusPagamento = 'aguardando_pagamento';
      }

      // Atualizar pedido
      const { data: pedido, error } = await supabase
        .from('pedidos')
        .update({
          status_pagamento: statusPagamento,
          mp_payment_id: paymentId,
          mp_status: status,
          data_pagamento: status === 'approved' ? new Date().toISOString() : null
        })
        .eq('id', external_reference)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar pedido:', error);
        return false;
      }

      // Se aprovado, criar notificação para admin
      if (statusPagamento === 'pago') {
        // Buscar admin
        const { data: admins } = await supabase
          .from('usuarios')
          .select('id')
          .eq('role', 'administrador')
          .limit(1);

        if (admins && admins.length > 0) {
          await supabase.from('notificacoes').insert([{
            usuario_id: admins[0].id,
            tipo: 'pagamento_confirmado',
            titulo: 'Novo Pagamento Confirmado',
            mensagem: `Pedido #${pedido.id} - ${pedido.plano_nome} - R$ ${pedido.valor}`,
            pedido_id: pedido.id
          }]);
        }

        // Notificar cliente
        await supabase.from('notificacoes').insert([{
          usuario_id: pedido.usuario_id,
          tipo: 'pagamento_aprovado',
          titulo: 'Pagamento Aprovado',
          mensagem: 'Seu pagamento foi confirmado! Aguarde o envio das credenciais.',
          pedido_id: pedido.id
        }]);
      }

      return true;
    } catch (error) {
      console.error('Erro ao processar notificação:', error);
      return false;
    }
  }

  /**
   * Consultar status de pagamento
   */
  async consultarPagamento(paymentId) {
    try {
      const payment = await mercadopago.payment.findById(paymentId);
      return {
        status: payment.body.status,
        status_detail: payment.body.status_detail,
        transaction_amount: payment.body.transaction_amount,
        date_approved: payment.body.date_approved
      };
    } catch (error) {
      console.error('Erro ao consultar pagamento:', error);
      throw error;
    }
  }

  /**
   * Criar link de pagamento via PIX
   */
  async criarPagamentoPix(pedido, usuario) {
    try {
      const payment = {
        transaction_amount: parseFloat(pedido.valor),
        description: `${pedido.plano_nome} - ${pedido.plano_duracao_dias} dias`,
        payment_method_id: 'pix',
        external_reference: pedido.id,
        payer: {
          email: usuario.email,
          first_name: usuario.nome_completo.split(' ')[0],
          last_name: usuario.nome_completo.split(' ').slice(1).join(' ') || 'Cliente'
        },
        notification_url: `${process.env.BACKEND_URL}/api/webhooks/mercadopago`
      };

      const response = await mercadopago.payment.create(payment);

      // Atualizar pedido
      await supabase
        .from('pedidos')
        .update({
          mp_payment_id: response.body.id
        })
        .eq('id', pedido.id);

      return {
        payment_id: response.body.id,
        qr_code: response.body.point_of_interaction.transaction_data.qr_code,
        qr_code_base64: response.body.point_of_interaction.transaction_data.qr_code_base64,
        ticket_url: response.body.point_of_interaction.transaction_data.ticket_url
      };
    } catch (error) {
      console.error('Erro ao criar pagamento PIX:', error);
      throw error;
    }
  }
}

module.exports = new MercadoPagoService();

// =====================================================
// ROTAS ADICIONAIS PARA MERCADO PAGO
// Adicionar ao server.js
// =====================================================

/*
const mercadoPagoService = require('./mercadopago.service');

// Criar preferência de pagamento
app.post('/api/pagamento/criar-preferencia', authMiddleware, async (req, res) => {
  try {
    const { pedido_id } = req.body;

    // Buscar pedido
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', pedido_id)
      .eq('usuario_id', req.user.id)
      .single();

    if (error || !pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    if (pedido.status_pagamento !== 'aguardando_pagamento') {
      return res.status(400).json({ error: 'Pedido já processado' });
    }

    // Criar preferência
    const preferencia = await mercadoPagoService.criarPreferencia(pedido, req.user);

    res.json(preferencia);
  } catch (error) {
    console.error('Erro ao criar preferência:', error);
    res.status(500).json({ error: 'Erro ao criar preferência de pagamento' });
  }
});

// Criar pagamento PIX
app.post('/api/pagamento/criar-pix', authMiddleware, async (req, res) => {
  try {
    const { pedido_id } = req.body;

    const { data: pedido } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', pedido_id)
      .eq('usuario_id', req.user.id)
      .single();

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const pixData = await mercadoPagoService.criarPagamentoPix(pedido, req.user);

    res.json(pixData);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar pagamento PIX' });
  }
});

// Consultar status de pagamento
app.get('/api/pagamento/status/:payment_id', authMiddleware, async (req, res) => {
  try {
    const { payment_id } = req.params;

    // Verificar se o pagamento pertence ao usuário
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('*')
      .eq('mp_payment_id', payment_id)
      .eq('usuario_id', req.user.id)
      .single();

    if (!pedido) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    const status = await mercadoPagoService.consultarPagamento(payment_id);

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar status' });
  }
});

// Webhook aprimorado
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    // Validar origem do webhook (recomendado em produção)
    // const signature = req.headers['x-signature'];
    // await mercadoPagoService.validarWebhook(signature, req.body);

    if (type === 'payment') {
      await mercadoPagoService.processarNotificacao(data.id);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});
*/