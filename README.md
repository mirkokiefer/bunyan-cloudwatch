#bunyan-cloudwatch [![Build Status](https://secure.travis-ci.org/mirkokiefer/bunyan-cloudwatch.svg)](http://travis-ci.org/mirkokiefer/bunyan-cloudwatch)

Stream to write [bunyan](https://github.com/trentm/node-bunyan) logs to [AWS CloudWatch](http://aws.amazon.com/cloudwatch/).

This is actually a plain [Node.js Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable) object stream so could be used without bunyan.

##Usage

``` js
var bunyan = require('bunyan');
var bunyanCW = require('bunyan-cloudwatch');

var stream = bunyanCW({
  logGroupName: 'my-group',
  logStreamName: 'my-stream',
  region: 'us-west-1'
});

var log = bunyan.createLogger({
  name: 'foo',
  streams: [
    {
      stream: stream,
      type: 'raw'
    }
  ]
});
```

##API

###createCWStream(opts)
With `opts` of:

- `logGroupName` (required)
- `logStreamName` (required)
- `region` (required): the AWS region e.g. `us-west-1`
- `credentials` (optional): specific CloudWatch credentials to use, otherwise default AWS credentials will be used

On write of the first log, the module creates the logGroup and logStream if necessary.

We use the aws-sdk to write the logs - the default AWS credentials have therefore to be configured using environment variables (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`). 
Optionally, you may supply specific credentials to the constructor, if you want to access CloudWatch as different user from the default.

- [Configuring the aws-sdk](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html)
- [`CloudWatchLogs.putLogEvents`](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) is the method we use to write logs

##Contributors
This project was created by Mirko Kiefer ([@mirkokiefer](https://github.com/mirkokiefer)).