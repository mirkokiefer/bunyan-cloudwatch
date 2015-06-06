
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

  this.cloudwatch = new AWS.CloudWatchLogs();
  this.queuedLogs = [];
  this.sequenceToken = null;
  this.writeQueued = false;
}

CloudWatchStream.prototype._write = function (record, _enc, cb) {
  this.queuedLogs.push(record);
  if (!this.writeQueued) {
    setTimeout(this._writeLogs.bind(this), this.writeInterval);
    this.writeQueued = true;
  }
  cb();
}

CloudWatchStream.prototype._writeLogs = function () {
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
  this.writeQueued = false;
  var obj = this;
  this.cloudwatch.putLogEvents(log, function (err, res) {
    if (err) {
      if (obj.onError) return obj.onError(err);
      throw err;
    }
    obj.sequenceToken = res.nextSequenceToken;
  });
}

CloudWatchStream.prototype._getSequenceToken = function (done) {
  var params = {
    logGroupName: this.logGroupName,
    logStreamNamePrefix: this.logStreamName
  };
  var obj = this;
  this.cloudwatch.describeLogStreams(params, function(err, data) {
    if (err) {
      return this._error(err);
    }
    if (data.logStreams.length == 0) {
      return this._error(new Error('logStreamName not found'));
    }
    obj.sequenceToken = data.logStreams[0].uploadSequenceToken;
    done();
  });
}

CloudWatchStream.prototype._error = function (err) {
  if (obj.onError) return obj.onError(err);
  throw err;
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

