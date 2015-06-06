
var assert = require('assert');
var bunyan = require('bunyan');
var proxyquire = require('proxyquire');
var sinon = require('sinon');

var logGroupName = 'test-group';
var logStreamName = 'test-stream';

var awsStub = createAWSStub();
var createCWStream = proxyquire('../', {
  'aws-sdk': awsStub
});

var cwStream = createCWStream({
  logGroupName: logGroupName,
  logStreamName: logStreamName
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

describe('bunyan-cloudwatch', function () {
  it('should write logs to CloudWatch', function (done) {
    awsStub.onLog = onLog;
    log.info({foo: 'bar'}, 'test log 1');
    log.info({foo: 'bar'}, 'test log 2');

    function onLog(params) {
      assert.equal(params.logGroupName, logGroupName);
      assert.equal(params.logStreamName, logStreamName);
      assert.equal(params.logEvents.length, 2);

      var event1 = params.logEvents[0];
      var message1 = JSON.parse(event1.message);
      assert.equal(message1.msg, 'test log 1');
      assert.equal(message1.foo, 'bar');
      assert.ok(event1.timestamp);

      var event2 = params.logEvents[1];
      var message2 = JSON.parse(event2.message);
      assert.equal(message2.msg, 'test log 2');

      done();
    }
  });

  it('should by default write all logs after one tick', function (done) {
    awsStub.onLog = onLog;
    var i = 0;

    log.info({foo: 'bar'}, 'test log 1');
    log.info({foo: 'bar'}, 'test log 2');

    setTimeout(function () {
      log.info({foo: 'bar'}, 'test log 3');
      log.info({foo: 'bar'}, 'test log 4');
    }, 0);

    function onLog(params) {
      assert.equal(params.logEvents.length, 2);
      if (i++ == 1) done();
    }
  });

  it('should allow longer write intervals', function (done) {
    cwStream.writeInterval = 50;
    awsStub.onLog = onLog;
    var i = 0;

    log.info({foo: 'bar'}, 'test log 1');
    log.info({foo: 'bar'}, 'test log 2');

    setTimeout(function () {
      log.info({foo: 'bar'}, 'test log 3');
      log.info({foo: 'bar'}, 'test log 4');
    }, 20);

    setTimeout(function () {
      log.info({foo: 'bar'}, 'test log 5');
      log.info({foo: 'bar'}, 'test log 6');
    }, 60);

    function onLog(params) {
      assert.equal(params.logEvents.length, i == 0 ? 4 : 2);
      if (i++ == 1) done();
    }
  });

  it('should use the sequenceToken returned by CloudWatch', function (done) {
    cwStream.writeInterval = 0;
    cwStream.sequenceToken = undefined;
    awsStub.onLog = onLog;
    var i = 0;

    log.info({foo: 'bar'}, 'test log 1');

    setTimeout(function () {
      log.info({foo: 'bar'}, 'test log 2');
    }, 0);

    function onLog(params) {
      assert.equal(params.sequenceToken, i == 0 ? undefined : 'magic-token');
      if (i++ == 1) done();
    }
  });

  it('should forward errors from CloudWatch', function (done) {
    cwStream.cloudwatch.putLogEvents = function (params, cb) {
      cb(new Error('aws error'));
    }
    cwStream.onError = onError;
    log.info({foo: 'bar'}, 'test log 1');

    function onError(err) {
      assert.ok(err);
      done();
    }
  });
})

function createAWSStub(onLog) {
  var obj = {
    CloudWatchLogs: CloudWatchLogsStub
  }

  function CloudWatchLogsStub() {

  }

  // docs: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property
  CloudWatchLogsStub.prototype.putLogEvents = function (params, cb) {
    obj.onLog(params);
    cb(null, {nextSequenceToken: 'magic-token'});
  }

  CloudWatchLogsStub.prototype.describeLogStreams = function (params, cb) {
    cb(null, {
      logStreams: [
        {
          uploadSequenceToken: undefined
        }
      ]
    });
  }

  return obj;
}