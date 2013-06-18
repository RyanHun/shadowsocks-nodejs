// Generated by CoffeeScript 1.6.2
(function() {
  var Encryptor, METHOD, SERVER, config, configContent, configFile, configFromArgs, connections, fs, inet, inetAton, inetNtoa, k, key, net, path, port, portPassword, timeout, utils, v, _fn;

  net = require("net");

  fs = require("fs");

  path = require("path");

  utils = require("./utils");

  inet = require("./inet");

  Encryptor = require("./encrypt").Encryptor;

  console.log(utils.version);

  inetNtoa = function(buf) {
    return buf[0] + "." + buf[1] + "." + buf[2] + "." + buf[3];
  };

  inetAton = function(ipStr) {
    var buf, i, parts;

    parts = ipStr.split(".");
    if (parts.length !== 4) {
      return null;
    } else {
      buf = new Buffer(4);
      i = 0;
      while (i < 4) {
        buf[i] = +parts[i];
        i++;
      }
      return buf;
    }
  };

  configFromArgs = utils.parseArgs();

  configFile = configFromArgs.config_file || path.resolve(__dirname, "config.json");

  configContent = fs.readFileSync(configFile);

  config = JSON.parse(configContent);

  for (k in configFromArgs) {
    v = configFromArgs[k];
    config[k] = v;
  }

  if (config.verbose) {
    utils.config(utils.DEBUG);
  }

  timeout = Math.floor(config.timeout * 1000);

  portPassword = config.port_password;

  port = config.server_port;

  key = config.password;

  METHOD = config.method;

  SERVER = config.server;

  connections = 0;

  if (portPassword) {
    if (port || key) {
      utils.warn('warning: port_password should not be used with server_port and password. server_port and password will be ignored');
    }
  } else {
    portPassword = {};
    portPassword[port.toString()] = key;
  }

  _fn = function() {
    var KEY, PORT, server, server_ip, servers, _i, _len;

    PORT = port;
    KEY = key;
    server = net.createServer(function(connection) {
      var addrLen, cachedPieces, clean, encryptor, headerLength, remote, remoteAddr, remotePort, stage;

      connections += 1;
      encryptor = new Encryptor(KEY, METHOD);
      stage = 0;
      headerLength = 0;
      remote = null;
      cachedPieces = [];
      addrLen = 0;
      remoteAddr = null;
      remotePort = null;
      utils.debug("connections: " + connections);
      clean = function() {
        utils.debug("clean");
        connections -= 1;
        remote = null;
        connection = null;
        return encryptor = null;
      };
      connection.on("data", function(data) {
        var addrtype, buf, e;

        utils.log(utils.EVERYTHING, "connection on data");
        try {
          data = encryptor.decrypt(data);
        } catch (_error) {
          e = _error;
          utils.error(e);
          if (remote) {
            remote.destroy();
          }
          if (connection) {
            connection.destroy();
          }
          return;
        }
        if (stage === 5) {
          if (!remote.write(data)) {
            connection.pause();
          }
          return;
        }
        if (stage === 0) {
          try {
            addrtype = data[0];
            if (addrtype === 3) {
              addrLen = data[1];
            } else if (addrtype !== 1 && addrtype !== 4) {
              utils.error("unsupported addrtype: " + addrtype);
              connection.destroy();
              return;
            }
            if (addrtype === 1) {
              remoteAddr = inetNtoa(data.slice(1, 5));
              remotePort = data.readUInt16BE(5);
              headerLength = 7;
            } else if (addrtype === 4) {
              remoteAddr = inet.inet_ntop(data.slice(1, 17));
              remotePort = data.readUInt16BE(17);
              headerLength = 19;
            } else {
              remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
              remotePort = data.readUInt16BE(2 + addrLen);
              headerLength = 2 + addrLen + 2;
            }
            remote = net.connect(remotePort, remoteAddr, function() {
              var i, piece;

              utils.info("connecting " + remoteAddr + ":" + remotePort);
              if (!encryptor) {
                if (remote) {
                  remote.destroy();
                }
                return;
              }
              i = 0;
              while (i < cachedPieces.length) {
                piece = cachedPieces[i];
                remote.write(piece);
                i++;
              }
              cachedPieces = null;
              stage = 5;
              return utils.debug("stage = 5");
            });
            remote.on("data", function(data) {
              utils.log(utils.EVERYTHING, "remote on data");
              if (!encryptor) {
                if (remote) {
                  remote.destroy();
                }
                return;
              }
              data = encryptor.encrypt(data);
              if (!connection.write(data)) {
                return remote.pause();
              }
            });
            remote.on("end", function() {
              utils.debug("remote on end");
              if (connection) {
                return connection.end();
              }
            });
            remote.on("error", function(e) {
              utils.debug("remote on error");
              return utils.error("remote " + remoteAddr + ":" + remotePort + " error: " + e);
            });
            remote.on("close", function(had_error) {
              utils.debug("remote on close:" + had_error);
              if (had_error) {
                if (connection) {
                  return connection.destroy();
                }
              } else {
                if (connection) {
                  return connection.end();
                }
              }
            });
            remote.on("drain", function() {
              utils.debug("remote on drain");
              return connection.resume();
            });
            remote.setTimeout(timeout, function() {
              utils.debug("remote on timeout");
              remote.destroy();
              return connection.destroy();
            });
            if (data.length > headerLength) {
              buf = new Buffer(data.length - headerLength);
              data.copy(buf, 0, headerLength);
              cachedPieces.push(buf);
              buf = null;
            }
            stage = 4;
            return utils.debug("stage = 4");
          } catch (_error) {
            e = _error;
            util.log(e);
            connection.destroy();
            if (remote) {
              return remote.destroy();
            }
          }
        } else {
          if (stage === 4) {
            return cachedPieces.push(data);
          }
        }
      });
      connection.on("end", function() {
        utils.debug("connection on end");
        if (remote) {
          return remote.end();
        }
      });
      connection.on("error", function(e) {
        utils.debug("connection on error");
        return utils.error("local error: " + e);
      });
      connection.on("close", function(had_error) {
        utils.debug("connection on close:" + had_error);
        if (had_error) {
          if (remote) {
            remote.destroy();
          }
        } else {
          if (remote) {
            remote.end();
          }
        }
        return clean();
      });
      connection.on("drain", function() {
        utils.debug("connection on drain");
        if (remote) {
          return remote.resume();
        }
      });
      return connection.setTimeout(timeout, function() {
        utils.debug("connection on timeout");
        if (remote) {
          remote.destroy();
        }
        if (connection) {
          return connection.destroy();
        }
      });
    });
    servers = SERVER;
    if (!(servers instanceof Array)) {
      servers = [servers];
    }
    for (_i = 0, _len = servers.length; _i < _len; _i++) {
      server_ip = servers[_i];
      server.listen(PORT, server_ip, function() {
        return utils.info("server listening at " + server_ip + ":" + PORT + " ");
      });
    }
    return server.on("error", function(e) {
      if (e.code === "EADDRINUSE") {
        utils.error("Address in use, aborting");
      }
      return process.exit(1);
    });
  };
  for (port in portPassword) {
    key = portPassword[port];
    _fn();
  }

}).call(this);
