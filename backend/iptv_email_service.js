// =====================================================
// EMAIL SERVICE - email.service.js
// =====================================================

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // true para 465, false para outras portas
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  /**
   * Enviar e-mail de confirmação de cadastro
   */
  async enviarConfirmacaoCadastro(usuario) {
    const mailOptions = {
      from: `"IPTV Revenda" <${process.env.EMAIL_USER}>`,
      to: usuario.email,
      subject: 'Bem-vindo à IPTV Revenda!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Bem-vindo(a)!</h1>
            </div>
            <div class="content">
              <h2>Olá, ${usuario.nome_completo}!</h2>
              <p>Sua conta foi criada com sucesso na IPTV Revenda.</p>
              <p>Agora você pode escolher seu plano e começar a aproveitar nossos serviços.</p>
              <a href="${process.env.FRONTEND_URL}/login" class="button">Acessar Minha Conta</a>
              <p>Se você tiver alguma dúvida, entre em contato conosco.</p>
            </div>
            <div class="footer">
              <p>IPTV Revenda - Todos os direitos reservados</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('E-mail de confirmação enviado para:', usuario.email);
    } catch (error) {
      console.error('Erro ao enviar e-mail de confirmação:', error);
    }
  }

  /**
   * Enviar e-mail de confirmação de pagamento
   */
  async enviarConfirmacaoPagamento(pedido, usuario) {
    const mailOptions = {
      from: `"IPTV Revenda" <${process.env.EMAIL_USER}>`,
      to: usuario.email,
      subject: 'Pagamento Confirmado - IPTV Revenda',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Pagamento Confirmado!</h1>
            </div>
            <div class="content">
              <h2>Olá, ${usuario.nome_completo}!</h2>
              <p>Seu pagamento foi confirmado com sucesso!</p>
              
              <div class="info-box">
                <h3>Detalhes do Pedido:</h3>
                <p><strong>Plano:</strong> ${pedido.plano_nome}</p>
                <p><strong>Duração:</strong> ${pedido.plano_duracao_dias} dias</p>
                <p><strong>Valor:</strong> R$ ${pedido.valor}</p>
                <p><strong>Pedido:</strong> #${pedido.id}</p>
              </div>
              
              <p>Suas credenciais de acesso serão enviadas em breve por nossa equipe.</p>
              <p>Você pode acompanhar o status do seu pedido na área do cliente.</p>
            </div>
            <div class="footer">
              <p>IPTV Revenda - Todos os direitos reservados</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('E-mail de confirmação de pagamento enviado');
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
    }
  }

  /**
   * Enviar credenciais IPTV para o cliente
   */
  async enviarCredenciaisIPTV(pedido, usuario, credenciais) {
    const mailOptions = {
      from: `"IPTV Revenda" <${process.env.EMAIL_USER}>`,
      to: usuario.email,
      subject: 'Suas Credenciais IPTV - Acesso Liberado',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .credentials-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #10b981; }
            .credential-item { padding: 10px; background: #f0fdf4; margin: 10px 0; border-radius: 5px; font-family: monospace; }
            .warning { background: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Acesso Liberado!</h1>
            </div>
            <div class="content">
              <h2>Olá, ${usuario.nome_completo}!</h2>
              <p>Suas credenciais de acesso IPTV estão prontas!</p>
              
              <div class="credentials-box">
                <h3>Suas Credenciais:</h3>
                ${credenciais}
              </div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul>
                  <li>Não compartilhe suas credenciais com terceiros</li>
                  <li>Seu acesso é válido por ${pedido.plano_duracao_dias} dias</li>
                  <li>Data de expiração: ${new Date(pedido.data_expiracao).toLocaleDateString('pt-BR')}</li>
                </ul>
              </div>
              
              <p>Em caso de dúvidas, entre em contato conosco.</p>
            </div>
            <div class="footer">
              <p>IPTV Revenda - Todos os direitos reservados</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('E-mail com credenciais enviado');
      return true;
    } catch (error) {
      console.error('Erro ao enviar credenciais:', error);
      return false;
    }
  }

  /**
   * Enviar aviso de expiração próxima
   */
  async enviarAvisoExpiracao(pedido, usuario, diasRestantes) {
    const mailOptions = {
      from: `"IPTV Revenda" <${process.env.EMAIL_USER}>`,
      to: usuario.email,
      subject: `Seu acesso IPTV expira em ${diasRestantes} dias`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Seu acesso está expirando</h1>
            </div>
            <div class="content">
              <h2>Olá, ${usuario.nome_completo}!</h2>
              <p>Seu plano <strong>${pedido.plano_nome}</strong> expira em <strong>${diasRestantes} dias</strong>.</p>
              <p>Data de expiração: ${new Date(pedido.data_expiracao).toLocaleDateString('pt-BR')}</p>
              <p>Renove agora para não perder o acesso aos seus conteúdos favoritos!</p>
              <a href="${process.env.FRONTEND_URL}/planos" class="button">Renovar Agora</a>
            </div>
            <div class="footer">
              <p>IPTV Revenda - Todos os direitos reservados</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Aviso de expiração enviado');
    } catch (error) {
      console.error('Erro ao enviar aviso:', error);
    }
  }

  /**
   * Notificar administrador sobre novo pagamento
   */
  async notificarAdminPagamento(pedido, usuario) {
    const { data: config } = await require('@supabase/supabase-js')
      .createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'notificacao_email_admin')
      .single();

    if (!config || !config.valor) return;

    const mailOptions = {
      from: `"IPTV Revenda" <${process.env.EMAIL_USER}>`,
      to: config.valor,
      subject: '💰 Novo Pagamento Confirmado',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; }
            .action { background: #fef3c7; padding: 15px; margin: 20px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💰 Novo Pagamento</h1>
            </div>
            <div class="content">
              <h2>Pagamento Confirmado</h2>
              
              <div class="info-box">
                <p><strong>Cliente:</strong> ${usuario.nome_completo}</p>
                <p><strong>E-mail:</strong> ${usuario.email}</p>
                <p><strong>Telefone:</strong> ${usuario.telefone || 'Não informado'}</p>
              </div>
              
              <div class="info-box">
                <p><strong>Plano:</strong> ${pedido.plano_nome}</p>
                <p><strong>Duração:</strong> ${pedido.plano_duracao_dias} dias</p>
                <p><strong>Valor:</strong> R$ ${pedido.valor}</p>
                <p><strong>Pedido:</strong> #${pedido.id}</p>
              </div>
              
              <div class="action">
                <strong>⚠️ Ação Necessária:</strong>
                <p>Entre em contato com o fornecedor IPTV e envie as credenciais para o cliente.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Notificação de pagamento enviada ao admin');
    } catch (error) {
      console.error('Erro ao notificar admin:', error);
    }
  }
}

module.exports = new EmailService();

// =====================================================
// JOB PARA VERIFICAR EXPIRAÇÕES (CRON)
// Adicionar ao server.js ou criar arquivo separado
// =====================================================

/*
const cron = require('node-cron');
const emailService = require('./email.service');

// Executar todos os dias às 9h
cron.schedule('0 9 * * *', async () => {
  console.log('Verificando pedidos próximos da expiração...');
  
  try {
    // Buscar configuração de dias para aviso
    const { data: config } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'dias_aviso_expiracao')
      .single();
    
    const diasAviso = parseInt(config?.valor || '7');
    
    // Buscar pedidos que expiram em X dias
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + diasAviso);
    
    const { data: pedidos } = await supabase
      .from('vw_pedidos_completos')
      .select('*')
      .eq('status_acesso', 'ativo')
      .lte('data_expiracao', dataLimite.toISOString())
      .gte('data_expiracao', new Date().toISOString());
    
    for (const pedido of pedidos || []) {
      const diasRestantes = Math.ceil(
        (new Date(pedido.data_expiracao) - new Date()) / (1000 * 60 * 60 * 24)
      );
      
      const usuario = {
        nome_completo: pedido.cliente_nome,
        email: pedido.cliente_email
      };
      
      await emailService.enviarAvisoExpiracao(pedido, usuario, diasRestantes);
    }
    
    console.log(`${pedidos?.length || 0} avisos de expiração enviados`);
  } catch (error) {
    console.error('Erro no job de expiração:', error);
  }
});
*/