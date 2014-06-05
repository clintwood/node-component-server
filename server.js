// deps
var pushover = require('pushover');
var express = require('express');
var app = express();
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var zlib = require('zlib');
var config = require('./config.json');
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var logger = require('./logger.js');

// when running as a service make sure to change to the source js' dir
process.chdir(__dirname);

// config
var repoDir = process.env.GIT_REPO_DIR || config.GIT_REPO_DIR || path.join(__dirname, '/_gitrepos');
var logFile = process.env.GIT_LOG_FILE || config.GIT_LOG_FILE || path.join(__dirname, '/_gitrepos.log');

// ensure log & repo dirs exist
if (!fs.existsSync(path.dirname(repoDir)))
  mkdirp(path.dirname(repoDir));
if (!fs.existsSync(path.dirname(logFile)))
  mkdirp(path.dirname(logFile));

// init logging
var log = new logger('info', fs.createWriteStream(logFile, {flags: 'a'}));
log.debug('Logger started.')

// set repo location
var repos = pushover(repoDir, {
  autoCreate: false
})

// push logging
repos.on('push', function (info) {
  log.info('Repo Push: %s', info.repo + '/' + info.commit + ' (' + info.branch + ')');
  info.accept();
});

// tag logging
repos.on('tag', function (info) {
  log.info('Repo Tags: %s', info.repo + '/' + info.commit + ' (' + info.version + ')');
  info.accept();
});

// fetch logging
repos.on('fetch', function (info) {
  log.info('Repo Fetch: %s', info.repo + '/' + info.commit);
  info.accept();
});

// query logging
repos.on('info', function (info) {
  log.debug('Repo Query: %s', info.repo);
  info.accept();
});

// utils

function canCompress(req) {
  var ae = req.header('accept-encoding');
  return (ae && ~~ae.indexOf('gzip'));
}

function padZero(n) {
  return ((n < 10) ? '0' : '') + n;
}

// some housekeeping commands

// Get 'status' of server.
// Use:  http://<host>[:<port>]/status
// e.g.: http://localhost:8080/status
app.get('/status', function (req, res) {
  // handle socket termination errors
  res.on('error', function (err) {
    log.error('res.on(\'error\', ...): ' + err);
  });

  var json = require('./package.json');
  var msg = json.name + ' version: ' + json.version + '\n';
  var cmd = spawn('sh', ['-c', 'git --version']);

  if (canCompress(req)) {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Encoding': 'gzip'
    });
    zlib.gzip(msg, function (err, data) {
      res.write(data);
      cmd.stdout.pipe(zlib.createGzip()).pipe(res);
      res.end();
      cmd.on('error', function (err) {
        zlib.gzip('Error getting git version: ' + err, function (err, data) {
          res.write(data);
          res.end();
        });
      });
    });
  } else {
    res.write(msg);
    // pipe out to response
    cmd.stdout.pipe(res);
    cmd.on('error', function (err) {
      res.write('Error getting git version: ' + err);
    });
  }
});

// Catch requests for repos/ls (list all repos)
// Use:  http://<host>[:<port>]/repos/ls>
// e.g.: http://localhost:8080/repos/ls
app.get('/repos/ls', function (req, res) {

  // handle error on res when client unexpectedly terminates the socket 
  res.on('error', function (err) {
    log.error('res.on(\'error\', ...): ' + err);
  });

  // Spawn out to cmd to list all folders that are repos
  // run the ls command through a shell else the wildcards will not be expanded!
  // exec calls system which IS a shell, spawn calls execvp which is NOT a shell.
  var cmd = spawn('sh', ['-c', 'ls -d1 */*.git'], {
    cwd: repoDir
  });
  // compress if requested
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (canCompress(req)) {
    res.setHeader('Content-Encoding', 'gzip');
    var gzip = zlib.createGzip();
    cmd.stdout.pipe(gzip).pipe(res);
  } else {
    cmd.stdout.pipe(res);
  }
});

// Catch requests for repos/mk/<cat>/<repo> (to make a new repo)
// Use:  http://<host>[:<port>]/repos/mk/<cat>/<repo>
// e.g.: http://localhost:8080/repos/mk/<cat>/<repo>
app.get('/repos/mk/:cat/:repo', function (req, res) {
  var repopath = req.params.cat + '/' + req.params.repo;
  if (!repopath.match(/\.git$/i))
    repopath = repopath + '.git';

  // handle error on res when client unexpectedly terminates the socket 
  res.on('error', function (err) {
    log.error('res.on(\'error\', ...): ' + err);
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  repos.exists(repopath, function (err) {
    if (err) {
      res.send('Repo \'' + repopath + '\' already exists.');
    } else {
      repos.create(repopath, function (err) {
        if (err) {
          res.send('Repo \'' + repopath + '\' could not be created: ' + err + '.');
        } else {
          res.send('Repo \'' + repopath + '\' was successfully created.');
        }
      });
    }
  });
});

// Catch requests for repos/rm/<cat>/<repo> (to archive existing repo)
// Use:  http://<host>[:<port>]/repos/rm/<cat>/<repo>
// e.g.: http://localhost:8080/repos/rm/<cat>/<repo>
app.get('/repos/rm/:cat/:repo', function (req, res) {
  var repopath = req.params.cat + '/' + req.params.repo;
  if (!repopath.match(/\.git$/i))
    repopath = repopath + '.git';

  // handle error on res when client unexpectedly terminates the socket 
  res.on('error', function (err) {
    log.error('res.on(\'error\', ...): ' + err);
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  repos.exists(repopath, function (exists) {
    if (!exists) {
      res.send('Repo \'' + repopath + '\' does not exist.');
    } else {
      var d = new Date();
      var graveyard = repopath + '-' + d.getFullYear() + padZero(d.getMonth() + 1) + padZero(d.getDate()) + '-' + padZero(d.getHours() + 1) + padZero(d.getMinutes())

      fs.rename(path.join(repoDir, repopath), path.join(repoDir, graveyard), function (err) {
        if (err) {
          res.send('Repo \'' + repopath + '\' could not be archived: ' + err + '.');
        } else {
          res.send('Repo \'' + repopath + '\' was successfully archived to: ' + graveyard + '.');
        }
      });
    }
  });
});

// Catch requests for GitHub style tags request
// Use:  http://<host>[:<port>]/<category>/<repo>/tags
// e.g.: http://localhost:8080/repos/servers/node-component-server/tags
app.get('/repos/:cat/:repo/tags', function (req, res) {
  var repopath = req.params.cat + '/' + req.params.repo + '.git';
  repos.exists(repopath, function (found) {
    if (!found) {
      res.send(404);
      return;
    }

    var tags;

    // Spawn out to git archive to retrieve required file
    var git = spawn('git', ['tag', '-l'], {
      cwd: repoDir + '/' + repopath
    });

    // will always return json
    res.setHeader('Content-Type', 'application/json charset=utf-8');

    git.stdout.setEncoding('utf8');
    git.stdout.on('data', function (data) {
      tags = data
        .split('\n')
        .slice(0, -1)
        .map(function (tag) { return {name: tag}; });
    });

    git.stderr.on('data', function (data) {
      res.write('{"message": "Not Found"}');
      res.end(404);
    });

    git.on('close', function (code) {
      // Setup headers for gzip response
      if (!tags) {
        res.write('{"message": "Not Found"}');
        res.end(404);
        return;
      }

      var out = JSON.stringify(tags);
      // compress if requested
      if (canCompress(req)) {
        res.setHeader('Content-Encoding', 'gzip');
        zlib.gzip(out, function (err, data) {
          res.write(data);
          res.end();
        });
      } else {
        res.write(out);
        res.end();
      }
    });
  });
});

// Catch git requests
app.all(/^\/(.*)\.git/, function (req, res) {
  repos.handle(req, res);
});

// Catch requests for GitHub style npm tarballs and redirect with a reasonable name
// Use:  http://<host>[:<port>]/<category>/<repo>/tarball/<ref>
// e.g.: http://localhost:8080/client/person/tarball/master
app.get('/:cat/:repo/tarball/:ref', function (req, res) {
  var repopath = req.params.cat + '/' + req.params.repo + '.git';
  repos.exists(repopath, function (found) {
    if (!found) {
      res.send(404);
      return;
    }
    // Redirect if we don't have a pretty name
    res.redirect(req.originalUrl + '/' + req.params.cat + '-' + req.params.repo + '-' + req.params.ref + '.tar.gz')
  });
});

// Catch requests for GitHub style npm tarballs with a name
// Use:  http://<host>[:<port>]/<category>/<repo>/tarball/<ref>/name
// e.g.: http://localhost:8080/client/person/tarball/master/client-person-master
app.get('/:cat/:repo/tarball/:ref/:name', function (req, res) {
  var repopath = req.params.cat + '/' + req.params.repo + '.git';
  repos.exists(repopath, function (found) {
    if (!found) {
      res.send(404);
      return;
    }

    // Spawn out to git archive to retrieve required file
    var git_archive = spawn('git', ['archive', '--format=tar', '--prefix=' + req.params.name + '/', req.params.ref], {
      cwd: repoDir + '/' + repopath
    });

    // Setup headers for gzip response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // compress if requested
    if (canCompress(req)) {
      res.setHeader('Content-Encoding', 'gzip');
      var gzip = zlib.createGzip();
      git_archive.stdout.pipe(gzip).pipe(res);
    } else {
      git_archive.stdout.pipe(res);
    }
  });
});

// Catch requests for GitHub style raw files
// Use:  http://<host>[:<port>]/<category>/<repo>/<ref>/<relative path to file in repo>
// e.g.: http://localhost:8080/client/person/master/component.json
app.get('/:cat/:repo/:ref/*', function (req, res) {
  var repopath = req.params.cat + '/' + req.params.repo + '.git';
  repos.exists(repopath, function (found) {
    if (!found) {
      res.send(404);
      return;
    }

    // handle error on res when client unexpectedly terminates the socket 
    res.on('error', function (err) {
      log.error('res.on(\'error\', ...): ' + err);
    });

    // precheck existence of requested resource
    var git_cat_file = exec('git cat-file -e ' + req.params.ref + ':' + req.params[0], {
        cwd: repoDir + '/' + repopath
      },
      function (err, stdout, stderr) {
        if (err) {
          res.send(404, err);
        } else {
          next();
        }
      }
    );

    function next() {
      // Spawn out to git show to retrieve required file
      var git_show = spawn('git', ['show', '--format=raw', req.params.ref + ':' + req.params[0]], {
        cwd: repoDir + '/' + repopath
      });
      // setup response
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      // compress if requested
      if (canCompress(req)) {
        res.setHeader('Content-Encoding', 'gzip');
        var gzip = zlib.createGzip();
        // set to pipe through gzip directly out to http response
        git_show.stdout.pipe(gzip).pipe(res);
      } else {
        git_show.stdout.pipe(res);
      }
    }
  });
});

app.get('*', function (req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.write('Usage:\n');
  res.write('  http://server:port/status                        Returns the status of the server.\n');
  res.write('  http://server:port/repos/ls                      Returns a list of repositiories.\n');
  res.write('  http://server:port/repos/mk/<cat>/<repo[.git]>   Create a new repo on the server.\n');
  res.write('  http://server:port/repos/rm/<cat>/<repo[.git]>   Archives an existing repo on the server.\n');
  res.send();
});

var port = parseInt(process.env.GIT_REPO_PORT || config.GIT_REPO_PORT || '80');
log.info('Node-Component-Server is listening on port: ' + port);
log.info('Repos Dir is: ' + path.resolve(repoDir));
app.listen(port);