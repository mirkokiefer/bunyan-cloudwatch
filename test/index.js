
var assert = require('assert');
var bunyan = require('bunyan');
var proxyquire = require('proxyquire');
var sinon = require('sinon');

var logGroupName = 'test-group';
var logStreamName = 'test-stream';

describe('bunyan-cloudwatch', function () {
  var awsStub;
  var cwStream;
  var log;
  beforeEach(function setup() {
    awsStub = createAWSStub();
    var createCWStream = proxyquire('../', {
      'aws-sdk': awsStub
    });

    cwStream = createCWStream({
      logGroupName: logGroupName,
      logStreamName: logStreamName
    });
    log = bunyan.createLogger({
      name: 'foo',
      streams: [
        {
          stream: cwStream,
          type: 'raw'
        }
      ]
    });
  });

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
  
  it("should retry with error: InvalidSequenceTokenException", function(done){
    cwStream.sequenceToken = undefined;
    awsStub.onRes = onRes;
    var i = 0;

    log.info({foo: 'bar'}, 'test log 1');

    setTimeout(function () {
      cwStream.sequenceToken = 'not-correct';
      log.info({foo: 'bar'}, 'test log 2');
    }, 0);

    function onRes(err, res) {
      
      // console.log("res:", i, err || null, res || null);
      if(i == 0){
        assert.ok(res);
      }
      
      if(i == 1){
        assert.equal(err.code, "InvalidSequenceTokenException");
      }
      
      if(i == 2){
        assert.ok(res);
      }
      
      if(i++ == 2){
        done();
      }
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

  it('should create log stream if necessary', function (done) {
    cwStream.cloudwatch.describeLogStreams = function (params, cb) {
      cb(null, {logStreams: []});
    }
    cwStream.cloudwatch.createLogStream = createLogStreamStub;
    awsStub.onLog = onLog;
    var created = false;

    log.info({foo: 'bar'}, 'test log 1');

    function createLogStreamStub(params, cb) {
      created = true;
      cwStream.cloudwatch.describeLogStreams = describeLogStreamsStubDefault;
      cb();
    }

    function onLog(params) {
      assert.equal(created, true);
      assert.equal(params.sequenceToken, undefined);
      done();
    }
  });

  it('should create log group and stream if necessary', function (done) {
    cwStream.sequenceToken = null;
    cwStream.cloudwatch.describeLogStreams = function (params, cb) {
      var err = new Error();
      err.name = 'ResourceNotFoundException';
      cb(err);
    }
    cwStream.cloudwatch.createLogGroup = createLogGroupStub;
    cwStream.cloudwatch.createLogStream = createLogStreamStub;
    awsStub.onLog = onLog;
    var events = [];

    log.info({foo: 'bar'}, 'test log 1');

    function createLogGroupStub(params, cb) {
      events.push('create_group');
      cb();
    }

    function createLogStreamStub(params, cb) {
      events.push('create_stream');
      cwStream.cloudwatch.describeLogStreams = describeLogStreamsStubDefault;
      cb();
    }

    function onLog(params) {
      assert.deepEqual(events, ['create_group', 'create_stream']);
      assert.equal(params.sequenceToken, undefined);
      done();
    }
  });
})

function createAWSStub(onLog) {
  var obj = {
    CloudWatchLogs: CloudWatchLogsStub
  }

  function CloudWatchLogsStub() {
    this.callCount = 0;
  }

  // docs: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property
  CloudWatchLogsStub.prototype.putLogEvents = function (params, cb) {
    if(typeof obj.onLog !== "undefined"){
      obj.onLog(params);
    }
    
    var err = null;
    var res = null;
    
    this.callCount++;
    if(this.callCount > 1 && params.sequenceToken != 'magic-token'){
      err = { 
        message: 'The given sequenceToken is invalid. The next expected sequenceToken is: magic-token',
        code: 'InvalidSequenceTokenException',
        statusCode: 400,
        retryable: false,
        retryDelay: 30 
      };
    }else{
      res = {nextSequenceToken: 'magic-token'};
    }
    
    if(typeof obj.onRes !== "undefined") {
      obj.onRes(err, res);
    }
    cb(err, res);
  }

  CloudWatchLogsStub.prototype.describeLogStreams = describeLogStreamsStubDefault

  return obj;
}

function describeLogStreamsStubDefault(params, cb) {
  cb(null, {
    logStreams: [
      {
        uploadSequenceToken: undefined
      }
    ]
  });
}