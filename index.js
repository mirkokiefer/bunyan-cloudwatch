
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
  this.sequenceToken = undefined;
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
      if (obj.onError) {
        return obj.onError(err);
      }
      throw err;
    }
    obj.sequenceToken = res.nextSequenceToken;
  });
}

function createCWLog(bunyanLog) {
  var log = {
    message: bunyanLog.msg,
    timestamp: new Date(bunyanLog.time).getTime()
  };
  for (var key in bunyanLog) {
    if (key === 'msg') continue;
    if (key === 'time') continue;
    log[key] = bunyanLog[key];
  }
  return log;
}
