#bunyan-cloudwatch

Stream to write [bunyan](https://github.com/trentm/node-bunyan) logs to cloudwatch.

##Usage

``` js
var bunyan = require('bunyan');
var createCWStream = require('bunyan-cloudwatch');

var stream = bunyanCW({
  logGroupName: 'my-group',
  logStreamName: 'my-stream'
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
- `writeInterval` (optional, default: `0`): allows configuring the write interval to CloudWatch

We use the aws-sdk to write the logs - the AWS credentials and settings have therefore to be configured.

- [Configuring the aws-sdk](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html)
- [`CloudWatchLogs.putLogEvents`](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) is the method we ue to write logs

##Contributors
This project was created by Mirko Kiefer ([@mirkokiefer](https://github.com/mirkokiefer)).