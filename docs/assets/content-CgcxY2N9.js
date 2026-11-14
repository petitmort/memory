const m=[{title:"风经过的地方",subtitle:"THE BEGINNING",date:"第一章 · 初见",text:`有些日子，过去很久以后，
依然能听见那天的风。`,note:`那是一个很普通的下午。
海是蓝的，时间很慢。
我们沿着海岸走了很远，
却都没有问，什么时候回去。`,caption:"把第一次心动，留给海风。",scene:"coast",color:"#9fbec1"},{title:"把日子过成夏天",subtitle:"LITTLE WONDERS",date:"第二章 · 日常",text:`后来才明白，
那些小事，就是全部。`,note:`两杯没有喝完的咖啡，
一张总是走错的地图，
还有你说“再待一会儿”时，
刚刚好落下的夕阳。`,caption:"没有特别的事，也值得记住。",scene:"sunset",color:"#d6a17e"},{title:"我们看过的远方",subtitle:"SOMEWHERE WITH YOU",date:"第三章 · 远行",text:`目的地并不重要，
身旁的人才是。`,note:`车窗外的山一重又一重，
陌生的城市下着小雨。
你把耳机分给我一半，
一段旅程，就有了自己的配乐。`,caption:"世界很大，而这一刻刚刚好。",scene:"mountain",color:"#8caaa2"},{title:"潮水会替我记得",subtitle:"UNTIL NEXT TIME",date:"第四章 · 此刻",text:`愿每一次想起，
都有温柔的回声。`,note:`故事没有停在最后一页。
它藏在下一次见面的路上，
藏在每一个平常的清晨，
也藏在此刻，读到这里的你心里。`,caption:"未完待续，来日方长。",scene:"night",color:"#758eaa"}];function y(T,o=1e3,n=720){const s=document.createElement("canvas");s.width=o,s.height=n;const e=s.getContext("2d");let b=731;const t=()=>(b=b*16807%2147483647,b/2147483647),a=T==="night",i=T==="sunset",S=T==="mountain",f=e.createLinearGradient(0,0,0,n);f.addColorStop(0,a?"#273e5c":i?"#bba6a1":"#a4c8ce"),f.addColorStop(.55,a?"#7f929c":i?"#f1c3a0":"#dce3d8"),f.addColorStop(1,a?"#536f7e":"#729c9e"),e.fillStyle=f,e.fillRect(0,0,o,n),e.fillStyle=a?"#f5ecd4":"#fff1cb",e.beginPath(),e.arc(o*.69,n*.3,a?24:44,0,Math.PI*2),e.fill();const r=n*.48;if(S)for(let l=0;l<4;l++){e.fillStyle=["#a5b8af","#7d9c96","#587d79","#365d5b"][l],e.beginPath(),e.moveTo(0,n);for(let c=0;c<=o;c+=20)e.lineTo(c,r+l*65-Math.sin(c/170+l*2)*85-Math.cos(c/70)*22);e.lineTo(o,n),e.fill()}else{e.fillStyle=a?"#3f6577":i?"#939fa2":"#65969f",e.fillRect(0,r,o,n-r);for(let l=0;l<200;l++){const c=r+t()*(n-r);e.strokeStyle=`rgba(245,243,222,${t()*.32})`,e.lineWidth=t()*2+1,e.beginPath();let u=t()*o;e.moveTo(u,c),e.lineTo(u+t()*o*.25+4,c),e.stroke()}e.fillStyle=a?"#384f58":"#ddd1b3",e.beginPath(),e.moveTo(0,n*.79),e.bezierCurveTo(o*.25,n*.63,o*.33,n*.9,o*.65,n),e.lineTo(0,n),e.fill(),e.strokeStyle="#eeead8",e.lineWidth=5,e.beginPath(),e.moveTo(0,n*.79),e.bezierCurveTo(o*.25,n*.63,o*.33,n*.9,o*.65,n),e.stroke(),e.fillStyle=a?"#293e44":"#607e77",e.beginPath(),e.moveTo(o,n*.63),e.lineTo(o*.82,n*.57),e.lineTo(o*.75,n*.6),e.lineTo(o*.68,n*.58),e.lineTo(o*.6,n*.66),e.lineTo(o,n*.72),e.fill()}for(let l=0;l<16e3;l++)e.fillStyle=t()>.5?"rgba(255,250,230,.045)":"rgba(20,40,40,.035)",e.fillRect(t()*o,t()*n,1+t()*2,1);return s}export{y as a,m as c};
