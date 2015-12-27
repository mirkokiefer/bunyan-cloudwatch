
var util = require('util');
var Writable = require('stream').Writable;
var AWS = require('aws-sdk');

module.exports = createCloudWatchStream;

function createCloudWatchStream(opts) {
  return new CloudWatchStream(opts);
}

util.inherits(CloudWatchStream, Writable);
function CloudWatchStream(opts) {
  Writable.call(this, {objectMode: true});
  this.logGroupName = opts.logGroupName;
  this.logStreamName = opts.logStreamName;
  this.writeInterval = opts.writeInterval || 0;

  this.cloudwatch = new AWS.CloudWatchLogs(opts.cloudWatchLogsOptions);
  this.queuedLogs = [];
  this.sequenceToken = null;
  this.writeQueued = false;
}

CloudWatchStream.prototype._write = function _write(record, _enc, cb) {
  this.queuedLogs.push(record);
  if (!this.writeQueued) {
    this.writeQueued = true;
    setTimeout(this._writeLogs.bind(this), this.writeInterval);
  }
  cb();
};

CloudWatchStream.prototype._writeLogs = function _writeLogs() {
  if (this.sequenceToken === null) {
    return this._getSequenceToken(this._writeLogs.bind(this));
  }
  var log = {
    logGroupName: this.logGroupName,
    logStreamName: this.logStreamName,
    sequenceToken: this.sequenceToken,
    logEvents: this.queuedLogs.map(createCWLog)
  };
  this.queuedLogs = [];
  var obj = this;
  writeLog();

  function writeLog() {
    obj.cloudwatch.putLogEvents(log, function (err, res) {
      if (err) {
        if (err.retryable) return setTimeout(writeLog, obj.writeInterval);
        return obj._error(err);
      }
      obj.sequenceToken = res.nextSequenceToken;
      if (obj.queuedLogs.length) {
        return setTimeout(obj._writeLogs.bind(obj), obj.writeInterval);
      }
      obj.writeQueued = false;
    });
  }
};

CloudWatchStream.prototype._getSequenceToken = function _getSequenceToken(done) {
  var params = {
    logGroupName: this.logGroupName,
    logStreamNamePrefix: this.logStreamName
  };
  var obj = this;
  this.cloudwatch.describeLogStreams(params, function (err, data) {
    if (err) {
      if (err.name === 'ResourceNotFoundException') {
        createLogGroupAndStream(obj.cloudwatch, obj.logGroupName, obj.logStreamName, createStreamCb);
        return;
      }
      obj._error(err);
      return;
    }
    if (data.logStreams.length === 0) {
      createLogStream(obj.cloudwatch, obj.logGroupName, obj.logStreamName, createStreamCb);
      return;
    }
    obj.sequenceToken = data.logStreams[0].uploadSequenceToken;
    done();
  });

  function createStreamCb(err) {
    if (err) return obj._error(err);
    // call again to verify stream was created - silently fails sometimes!
    obj._getSequenceToken(done);
  }
};

CloudWatchStream.prototype._error = function _error(err) {
  if (this.onError) return this.onError(err);
  throw err;
};

function createLogGroupAndStream(cloudwatch, logGroupName, logStreamName, cb) {
  cloudwatch.createLogGroup({
    logGroupName: logGroupName
  }, function (err) {
    if (err) return err;
    createLogStream(cloudwatch, logGroupName, logStreamName, cb);
  });
}

function createLogStream(cloudwatch, logGroupName, logStreamName, cb) {
  cloudwatch.createLogStream({
    logGroupName: logGroupName,
    logStreamName: logStreamName
  }, cb);
}

function createCWLog(bunyanLog) {
  var message = {};
  for (var key in bunyanLog) {
    if (key === 'time') continue;
    message[key] = bunyanLog[key];
  }
  var log = {
    message: JSON.stringify(message),
    timestamp: new Date(bunyanLog.time).getTime()
  };
  return log;
}


function BunyanCWError(message) {
  this.name = 'BunyanCWError';
  this.message = message || 'error in bunyan-cloudwatch';
}
BunyanCWError.prototype = Object.create(Error.prototype);
BunyanCWError.prototype.constructor = BunyanCWError;
