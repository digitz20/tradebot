const socket = io();
let chart;

function startBot(){ fetch("/start",{method:"POST"}); }
function stopBot(){ fetch("/stop",{method:"POST"}); }
function toggleTheme(){ document.body.classList.toggle("light"); }

socket.on("update",data=>{
  document.getElementById("symbol").innerText = data.symbol||"";
  document.getElementById("price").innerText = data.price||"";
  document.getElementById("rsi").innerText = data.rsi||"";
  document.getElementById("pnl").innerText = data.pnl||"";
  document.getElementById("streak").innerText = data.streak||"";
  document.getElementById("newsStatus").innerText = data.newsPaused?"Paused due to news":"Trading allowed";

  if(!chart){
    chart=new Chart(document.getElementById("chart"),{
      type:"line",
      data:{labels:[],datasets:[{label:"Price",data:[]} ] }
    });
  }
  if(data.price) {
    chart.data.labels.push("");
    chart.data.datasets[0].data.push(data.price);
    chart.update();
  }

  const table=document.getElementById("trades");
  table.innerHTML=(data.trades||[]).map(t=>`<tr><td>${t.symbol}</td><td>${t.side}</td><td>${t.price}</td></tr>`).join("");
});