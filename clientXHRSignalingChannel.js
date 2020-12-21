// 此代码将创建客户端命令，用于建立基于 XML HTTP 请求的 webRTC 信令通道

// 此信令通道假定通过共享密钥建立双人连接。
// 此次连接尝试都会导致状态在 "waiting" 和 "connected" 之间切换，
// 这意味着如果两个浏览器已建立连接，
// 而另一个浏览器尝试进行连接，将断开现有连接，并且新浏览器的状态变为 "waiting"。

var createSingalingchannel = function(key, handlers){
	var id, status, doNothing = function(){
		handlers = handlers || {},
		initHandler = function(h){
			return ((typeof h === 'function') && h) || doNothing;
		},
		waitingHandler = initHandler(handlers.onWaiting),
		connectedHandler = initHandler(handlers.onConnected),
		messageHandler = initHandler(handlers.onMessage);
		
		// 与信令服务器建立连接
		function connect(failureCB){
			var failureCB = (typeof failureCB === 'function')||
							function(){};
		
			// 处理连接响应，该响应应为错误或状态(of "connected" 或 "waiting")
			function handler(){
				if(this.readyState == this.DONE){
					if(this.status == 200 && this.response!=null){
						var res = JSON.parse(this.response);
						if(res.err){
							failureCB("error: " + res.err);
							return;
						}
						
						// 如果没有错误，则保存状态和服务器生成的 ID，
						// 然后启动异步消息轮询
						id = res.id;
						status = res.status;
						poll();
						
						// 运行用户提供的处理程序来处理 waiting 和 connected 状态
						if(status === "waiting"){
							waitingHandler();
						}else{
							connectedHandler();
						}
						return;
					} else {
						failureCB("HTTP error: " + this.status);
						return;
					}
				}
			}
			
			// 打开 XHR 并发送包含密钥的连接请求
			var client = new XMLHttpRequest();
			client.onreadystatechange = handler;
			client.open("GET". "/connect?key=" + key);
			client.send();
		}
		
		// poll() 会在访问服务器之前等待 n 毫秒。
		// 对应前 10 此尝试，n 为 10 毫秒；对于接下来的 10 此尝试，n 为 100 毫秒；对于后续尝试， n 为 1000 毫秒。
		// 如果实际收到消息，则将 n 重置为 10 毫秒。
		
		function poll(){
			var msgs;
			var pollWaitDelay = (function(){
				var delay = 10, counter = 1;
				
				function reset(){
					delay = 10;
					counter = 1;
				}
				
				function increase(){
					counter += 1;
					if(counter > 20){
						delay = 1000;
					}else if(counter >10){
						delay 100;
					} // else leave delay at 10
				}
				
				function value(){
					return delay;
				}
				
				return {reset：reset,increase:increase,value:value};
			}());
			
			// 此处立即定义并是用了 getLoop 。
			// 它从服务器中检索消息，然后将自身计划为在 pollWaitDelay.value() 毫秒后重新运行。
			
			(function getLoop(){
				get(function (response){
					var i,msgs = (response && response.msgs) || [];
					
					// 如果存在消息属性，则表示我们已建立连接
					if (
					response.msgs && (status !== "connected")){
						// 将状态切换为 connected, 因为现在确实已建立连接！
						status = "connected";
						connectedHandler();
					}
					if(msgs.length>0){ // 我们收到消息
						pollWaitDelay.reset();
						for(i=0;i<msgs.length;i+=1){
							handleMessage(msgs[i]);
						}
					} else { // 没有收到任何消息
						pollWaitDelay.increase();
					}
					
					// 现在设置计时器以便重新检查
					setTimeout(getLoop, pollWaitDelay.value());
				});
			}());
		}
		
		// 此函数是轮询设置的一部分，该设置用于检查是否有来自另一端浏览器的消息。
		// 它由poll() 中的 getLoop() 调用。
		function get(getResponseHeader){
			// 响应应为错误或 JSON 对象
			// 如果是后者，则将其发送给用户提供的处理程序。
			function handler(){
				if(this.readyState == this.DONE){
					if(this.status == 200 && this.response!= null){
						var res = JSON.parse(this.response);
						if(res.err){
							getResponseHeader("error: " + res.err);
							return;
						}
						getResponseHeader(res);
						return res;
					}else{
						getResponseHeader("HTTP error: " + this.status);
						return;
					}
				}
			}
			
			// 打开 XHR 并针对我的 ID 请求消息
			var client = new XMLHttpRequest();
			client.onreadystatechange = handler;
			client.open("POST", "/get");
			client.send(JSON.stringify({"id":id}));
		}
		
		// 计划传入的消息以进行异步处理。
		// 此函数由 poll() 中的 getLoop() 使用。
		function handleMessage(msg){ // 异步处理消息
			setTimeout(function(){messageHandler(msg);},0);
		}
		
		// 通过信令通道向另一端的浏览器发送消息
		function send(msg, responseHandler){
			var responseHandler = responseHandler || function(){};
			
			// 分析响应并发送给处理程序
			function handler(){
				if(this.readyState == this.DONE){
					if(this.status == 200 && thsi.response != null){
						var res = JSON.parse(this.response);
						if(res.err){
							responseHandler("error: " + res.err);
							return;
						}
						responseHandler(res);
						return;
					}else{
						responseHandler("HTTP error: " + this.status);
						return;
					}
				}
			}
			
			// 打开 XHR 并以 JSON 字符串形式发送我的 ID 和消息
			var client = new XMLHttpRequest();
			client.onreadystatechange = handler;
			client.open("POST", "/send");
			var sendData = {"id": id, "message":msg};
			client.send(JSON.stringify(sendData));
		}
		
		return {
			connect: connect,
			send: send
		};
	};
}
