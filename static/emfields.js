// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

// requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel

// MIT license

(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());

function compile_math(code){
	if(code==null || code===""){
		return null;
	}
	var f=compile_math_function(code);
	f.toString=function(){
		return code;
	};
	f.toJSON=f.toString;
	return f;
}

function fix_latex(str){
	return str.replace(/\\cos/g,"cos").replace(/\\arccos/g,"arccos").replace(/cos/g,"\\cos").replace(/arc\\cos/g,"\\arccos");
}

$(function(){
	var value=JSON.parse(document.body.getAttribute('data-value'));
	if(!value){value={};}
	var callbacks={};

	window.value=value;

	function call_callback(name){
		var arr=callbacks[name];
		for(var i=0;i<arr.length;i++){
			arr[i].call(arr[i]);
		}
	}

	function Model(properties, model){
		for(var i=0;i<properties.length;i++){
			(function(prop){
				if(callbacks[prop]==null){
					var elem=$('#'+prop);
					if(elem.hasClass('mathquill-editable')){
						if(value[prop]!=null){
							elem.mathquill('latex', fix_latex(value[prop]));
						}
						value[prop]=compile_math(value[prop]);
						elem.bind('keyup', function(){
							value[prop]=compile_math(elem.mathquill('latex'));
							call_callback(prop);
						});
					}else if(elem.attr('type')==='checkbox'){
						if(value[prop]==null){
							value[prop]=elem[0].checked;
						}else{
							elem[0].checked=value[prop];
						}
						elem.change(function(){
							value[prop]=elem[0].checked;
							call_callback(prop);
						});
					}else if(elem[0].tagName.toLowerCase()==='select'){
						if(value[prop]==null){
							value[prop]=elem.val();
						}else{
							elem.val(value[prop]);
						}
						elem.change(function(){
							value[prop]=elem.val();
							call_callback(prop);
						});
					}else{
						if(value[prop]==null){
							value[prop]=parseFloat(elem[0].value);
						}else{
							elem[0].value=value[prop];
						}
						elem.change(function(){
							value[prop]=parseFloat(elem[0].value);
							call_callback(prop);
						});
					}
					callbacks[prop]=[];
				}
				callbacks[prop].push(model);
			})(properties[i]);
		}
		model.call(model);
	}
	function CanvasModel(canvas, properties, model){
		canvas=$('#'+canvas)[0];
		model.can=canvas;
		canvas.width=Math.min(canvas.offsetWidth, canvas.offsetHeight);
		canvas.height=canvas.width;
		canvas.style.width=canvas.width+"px";
		canvas.style.height=canvas.style.width;
		model.ctx=canvas.getContext('2d');
		model.cxy=function(gx, gy){
			return [(gx-value.xmin)/((value.xmax-value.xmin)/this.can.width), this.can.height-((gy-value.ymin)/((value.ymax-value.ymin)/this.can.height))];
		};
		Model(properties, function(){
			window.requestAnimationFrame(function(){
				model.call(model);
			});
		});
	}

	var FONT="10px Arial";
	var mtxt=document.createElement('span');
	mtxt.style.position="absolute";
	mtxt.style.top="-9000px";
	mtxt.style.left="-9000px";
	document.body.appendChild(mtxt);

	function measure(txt){
		mtxt.innerText=txt;
		mtxt.textContent=txt;
	}

	CanvasModel('scalar-field-canvas', ['xmin', 'xmax', 'ymin', 'ymax', 'scalar_field_step', 'scalar_field'], function(){
		var arr=new Array(((this.can.width/scalar_field_step)*(this.can.height/scalar_field_step))|0);
		var idx=0;
		var min=Number.POSITIVE_INFINITY;
		var max=Number.NEGATIVE_INFINITY;

		if(value.scalar_field==null){
			this.ctx.clearRect(0, 0, this.can.width, this.can.height);
			return;
		}

		var x_scale=(value.xmax-value.xmin)/this.can.width;
		var y_scale=(value.ymax-value.ymin)/this.can.height;

		for(var x=0;x<this.can.width+value.scalar_field_step;x+=value.scalar_field_step){
			for(var y=0;y<this.can.height+value.scalar_field_step;y+=value.scalar_field_step){
				var val=value.scalar_field(x*x_scale+value.xmin, (this.can.height-y)*y_scale+value.ymin);
				if(isNaN(val) || val==null){
					arr[idx]=null;
				}else{
					arr[idx]=val;
					min=Math.min(min, val);
					max=Math.max(max, val);
				}
				idx++;
			}
		}
		idx=0;
		var per=255/(max-min);
		for(var x=0;x<this.can.width+value.scalar_field_step;x+=value.scalar_field_step){
			for(var y=0;y<this.can.height+value.scalar_field_step;y+=value.scalar_field_step){
				if(arr[idx]===null){
					this.ctx.fillStyle="white";
				}else{
					var z=Math.round((arr[idx]-min)*per);
					this.ctx.fillStyle="rgb("+z+","+z+","+z+")";
				}
				this.ctx.fillRect(x, y, value.scalar_field_step, value.scalar_field_step);
				idx++;
			}
		}
	});

	CanvasModel('grid-canvas', ['xmin', 'xmax', 'ymin', 'ymax'], function(){
		this.ctx.clearRect(0, 0, this.can.width, this.can.height);
		this.font=FONT;

		var x_scale=(value.xmax-value.xmin)/this.can.width;
		var y_scale=(value.ymax-value.ymin)/this.can.height;

		this.ctx.strokeStyle="rgb(50,50,100)";
		this.ctx.lineWidth=4;
		this.ctx.beginPath();
		this.ctx.moveTo(0, this.can.height-(((-value.ymin)/y_scale)|0));
		this.ctx.lineTo(this.can.width, this.can.height-(((-value.ymin)/y_scale)|0));

		this.ctx.moveTo(((-value.xmin)/x_scale)|0, 0);
		this.ctx.lineTo(((-value.xmin)/x_scale)|0, this.can.height);

		this.ctx.stroke();
	});

	//From http://stackoverflow.com/questions/808826/draw-arrow-on-canvas-tag
	function canvas_arrow(context, fromx, fromy, tox, toy){
	    var headlen = 10;   // length of head in pixels
	    var angle = Math.atan2(toy-fromy,tox-fromx);
	    context.moveTo(fromx, fromy);
	    context.lineTo(tox, toy);
	    context.lineTo(tox-headlen*Math.cos(angle-Math.PI/6),toy-headlen*Math.sin(angle-Math.PI/6));
	    context.moveTo(tox, toy);
	    context.lineTo(tox-headlen*Math.cos(angle+Math.PI/6),toy-headlen*Math.sin(angle+Math.PI/6));
	}

	CanvasModel('vector-field-canvas', ['xmin', 'xmax', 'ymin', 'ymax', 'vector_field_i', 'vector_field_j', 'vector_magnitude_display', 'vector_field_density'], function(){
		var x_scale=(value.xmax-value.xmin)/this.can.width;
		var y_scale=(value.ymax-value.ymin)/this.can.height;

		this.ctx.clearRect(0, 0, this.can.width, this.can.height);
		if(value.vector_field_i==null || value.vector_field_j==null){
			return;
		}

		this.ctx.strokeStyle="blue";
		this.ctx.lineWidth=2;
		if(value.vector_magnitude_display==='none' || value.vector_magnitude_display==='abssize'){
			this.ctx.beginPath();
			for(var x=(value.vector_field_density/2)|0;x<this.can.width+value.vector_field_density;x+=value.vector_field_density){
				for(var y=(value.vector_field_density/2)|0;y<this.can.height+value.vector_field_density;y+=value.vector_field_density){
					var gx=x*x_scale+value.xmin;
					var gy=(this.can.height-y)*y_scale+value.ymin;
					var i=value.vector_field_i(gx, gy);
					var j=value.vector_field_j(gx, gy);
					var fac=2;
					if(value.vector_magnitude_display==='none'){
						fac*=Math.sqrt(i*i+j*j);
					}
					i/=fac;
					j/=fac;
					var p0=this.cxy(gx-i, gy-j);
					var p1=this.cxy(gx+i, gy+j);

					canvas_arrow(this.ctx, p0[0], p0[1], p1[0], p1[1]);
				}
			}
			this.ctx.stroke();
		}
	});
	
	$('#canvas-container').click(function(evt){
		/*var elem=$('#canvas-container')[0];
		var x=evt.pageX;
		var y=evt.pageY;
		while(elem!==document.body){
			x-=elem.offsetLeft;
			y-=elem.offsetTop;
			elem=elem.offsetParent;
		}
		var can=$('#scalar-field-canvas')[0];
		var x_scale=(value.xmax-value.xmin)/can.width;
		var y_scale=(value.ymax-value.ymin)/can.height;
		alert(value.scalar_field(x*x_scale+value.xmin, (can.height-y)*y_scale+value.ymin));*/
	});

	$('#vector-field-magnitude').click(function(){
		var latex=fix_latex("\\sqrt{("+$('#vector_field_i').mathquill('latex')+")^2+("+$('#vector_field_j').mathquill('latex')+")^2}");
		$('#scalar_field').mathquill('latex', latex);
		value.scalar_field=compile_math(latex);
		call_callback('scalar_field');
	});

	$('#download-image').mousedown(function(){
		var cans=$('#canvas-container > canvas');
		var can=document.createElement('canvas');
		can.width=cans[0].width;
		can.height=cans[0].height;
		var ctx=can.getContext('2d');
		for(var i=0;i<cans.length;i++){
			ctx.drawImage(cans[i], 0, 0);
		}
		$('#download-image').attr('href', can.toDataURL());
	});

	$('#sharing-close-button').click(function(){
		$('#sharing-url')[0].style.display='none';
	});
	$('#share-button').click(function(){
		if(window.location.host.indexOf("github")>=0){
			alert("This functionality is not available on this host.");
			return;
		}
		$('#sharing-form-textarea').val(JSON.stringify(value));
		$('#sharing-form')[0].submit();
		$('#sharing-in-progress')[0].style.display='block';
	});
	(function(field){
		if(field && field.select){
			field.select();
		}
	})(document.getElementById('sharing-url-field'));
});