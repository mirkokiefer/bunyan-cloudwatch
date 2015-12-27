
var AWS = require('aws-sdk');
var uuid = require('uuid');
var bunyan = require('bunyan');
var createCWStream = require('../');

var region = 'us-west-1';
var logGroupName = 'test-group-' + uuid.v4();
var logStreamName = 'test-stream-' + uuid.v4();

var cwStream = createCWStream({
  logGroupName: logGroupName,
  logStreamName: logStreamName,
  cloudWatchLogsOptions: {
    region: region
  }
});

var log = bunyan.createLogger({
  name: 'foo',
  streams: [
    {
      stream: cwStream,
      type: 'raw'
    }
  ]
});

var cloudwatch = new AWS.CloudWatchLogs({
  region: region
});

describe('bunyan-cloudwatch e2e', function () {
  after(function (done) {
    cloudwatch.deleteLogGroup({
      logGroupName: logGroupName
    }, done);
  });

  it('should write logs to the stream and verify', function (done) {
    log.info({foo: 'bar'}, 'test log 1');
    log.info({foo: 'bar'}, 'test log 2');
    readLogEventsUntilFound(2, done);
  });

  it('should be able to continue a non-empty stream', function (done) {
    cwStream.sequenceToken = null;
    log.info({foo: 'bar'}, 'test log 3');
    log.info({foo: 'bar'}, 'test log 4');
    readLogEventsUntilFound(4, done);
  });
});

function readLogEventsUntilFound(count, done) {
  var params = {
    logGroupName: logGroupName,
    logStreamName: logStreamName
  };
  cloudwatch.getLogEvents(params, function (err, data) {
    if (err) return readLogEventsUntilFound(count, done);
    if (data.events.length === count) return done();
    readLogEventsUntilFound(count, done);
  });
}
