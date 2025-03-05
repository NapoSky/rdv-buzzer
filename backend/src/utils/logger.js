function info(category, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: 'INFO',
      category,
      message,
      ...data
    };
    console.log(JSON.stringify(logEntry));
  }
  
  function error(category, message, err) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: 'ERROR',
      category,
      message,
      error: err?.message || String(err),
      stack: err?.stack
    };
    console.error(JSON.stringify(logEntry));
  }
  
  function clientActivity(socket, event, details = {}) {
    const clientInfo = {
      socketId: socket.id,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      transport: socket.conn.transport.name,
      query: socket.handshake.query,
      isMobile: /mobile|android|iphone|ipad/i.test(socket.handshake.headers['user-agent']),
      timestamp: new Date().toISOString()
    };
    
    console.log(JSON.stringify({
      level: 'CLIENT_DEBUG',
      event,
      client: clientInfo,
      details
    }));
  }
  
  module.exports = {
    info,
    error,
    clientActivity
  };