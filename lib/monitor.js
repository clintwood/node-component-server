/**
 * Dependencies
 */

var log;
module.exports = function (repos, logger) {
  log = logger;
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
}