export interface MemoryChapter {
  title: string;
  subtitle: string;
  date: string;
  text: string;
  note: string;
  caption: string;
  scene: string;
  color: string;
  image?: string;
}
export const chapters: MemoryChapter[] = [
  {
    title: "风经过的地方",
    subtitle: "THE BEGINNING",
    date: "第一章 · 初见",
    text: "有些日子，过去很久以后，\n依然能听见那天的风。",
    note: "那是一个很普通的下午。\n海是蓝的，时间很慢。\n我们沿着海岸走了很远，\n却都没有问，什么时候回去。",
    caption: "把第一次心动，留给海风。",
    scene: "coast",
    color: "#9fbec1",
  },
  {
    title: "把日子过成夏天",
    subtitle: "LITTLE WONDERS",
    date: "第二章 · 日常",
    text: "后来才明白，\n那些小事，就是全部。",
    note: "两杯没有喝完的咖啡，\n一张总是走错的地图，\n还有你说“再待一会儿”时，\n刚刚好落下的夕阳。",
    caption: "没有特别的事，也值得记住。",
    scene: "sunset",
    color: "#d6a17e",
  },
  {
    title: "我们看过的远方",
    subtitle: "SOMEWHERE WITH YOU",
    date: "第三章 · 远行",
    text: "目的地并不重要，\n身旁的人才是。",
    note: "车窗外的山一重又一重，\n陌生的城市下着小雨。\n你把耳机分给我一半，\n一段旅程，就有了自己的配乐。",
    caption: "世界很大，而这一刻刚刚好。",
    scene: "mountain",
    color: "#8caaa2",
  },
  {
    title: "潮水会替我记得",
    subtitle: "UNTIL NEXT TIME",
    date: "第四章 · 此刻",
    text: "愿每一次想起，\n都有温柔的回声。",
    note: "故事没有停在最后一页。\n它藏在下一次见面的路上，\n藏在每一个平常的清晨，\n也藏在此刻，读到这里的你心里。",
    caption: "未完待续，来日方长。",
    scene: "night",
    color: "#758eaa",
  },
];

// Original procedural artwork; no remote assets or tracking requests.
export function artwork(
  kind: string,
  width = 1000,
  height = 720,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let seed = 731;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const night = kind === "night",
    sunset = kind === "sunset",
    mountain = kind === "mountain";
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, night ? "#273e5c" : sunset ? "#bba6a1" : "#a4c8ce");
  gradient.addColorStop(
    0.55,
    night ? "#7f929c" : sunset ? "#f1c3a0" : "#dce3d8",
  );
  gradient.addColorStop(1, night ? "#536f7e" : "#729c9e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = night ? "#f5ecd4" : "#fff1cb";
  ctx.beginPath();
  ctx.arc(width * 0.69, height * 0.3, night ? 24 : 44, 0, Math.PI * 2);
  ctx.fill();
  const horizon = height * 0.48;
  if (mountain) {
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = ["#a5b8af", "#7d9c96", "#587d79", "#365d5b"][j];
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 20)
        ctx.lineTo(
          x,
          horizon +
            j * 65 -
            Math.sin(x / 170 + j * 2) * 85 -
            Math.cos(x / 70) * 22,
        );
      ctx.lineTo(width, height);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = night ? "#3f6577" : sunset ? "#939fa2" : "#65969f";
    ctx.fillRect(0, horizon, width, height - horizon);
    for (let i = 0; i < 200; i++) {
      const y = horizon + random() * (height - horizon);
      ctx.strokeStyle = `rgba(245,243,222,${random() * 0.32})`;
      ctx.lineWidth = random() * 2 + 1;
      ctx.beginPath();
      let x = random() * width;
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * width * 0.25 + 4, y);
      ctx.stroke();
    }
    ctx.fillStyle = night ? "#384f58" : "#ddd1b3";
    ctx.beginPath();
    ctx.moveTo(0, height * 0.79);
    ctx.bezierCurveTo(
      width * 0.25,
      height * 0.63,
      width * 0.33,
      height * 0.9,
      width * 0.65,
      height,
    );
    ctx.lineTo(0, height);
    ctx.fill();
    ctx.strokeStyle = "#eeead8";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.79);
    ctx.bezierCurveTo(
      width * 0.25,
      height * 0.63,
      width * 0.33,
      height * 0.9,
      width * 0.65,
      height,
    );
    ctx.stroke();
    ctx.fillStyle = night ? "#293e44" : "#607e77";
    ctx.beginPath();
    ctx.moveTo(width, height * 0.63);
    ctx.lineTo(width * 0.82, height * 0.57);
    ctx.lineTo(width * 0.75, height * 0.6);
    ctx.lineTo(width * 0.68, height * 0.58);
    ctx.lineTo(width * 0.6, height * 0.66);
    ctx.lineTo(width, height * 0.72);
    ctx.fill();
  }
  // Fine photographic grain and a warm paper finish.
  for (let i = 0; i < 16000; i++) {
    ctx.fillStyle =
      random() > 0.5 ? "rgba(255,250,230,.045)" : "rgba(20,40,40,.035)";
    ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1);
  }
  return canvas;
}
