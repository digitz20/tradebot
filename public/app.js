const socket = io();
let chart;

function startBot(){ fetch("/start",{method:"POST"}); }
function stopBot(){ fetch("/stop",{method:"POST"}); }
function toggleTheme(){ document.body.classList.toggle("light"); }

function setScalpingMode(){
  fetch("/set-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "scalping" })
  });
}

function setTrendMode(){
  fetch("/set-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "trend" })
  });
}

socket.on("update", data => {
  // Update basic metrics
  document.getElementById("symbol").innerText = data.symbol || "";
  document.getElementById("price").innerText = data.price ? data.price.toFixed(4) : "";
  document.getElementById("rsi").innerText = data.rsi ? data.rsi.toFixed(2) : "";
  document.getElementById("aiScore").innerText = data.aiScore || "0.000";
  document.getElementById("confidence").innerText = data.confidence || "0.000";
  document.getElementById("tradingMode").innerText = data.tradingMode || "trend";
  document.getElementById("pnl").innerText = data.pnl ? data.pnl.toFixed(2) : "0.00";
  document.getElementById("newsSentiment").innerText = data.newsSentiment ? data.newsSentiment.toFixed(2) : "0.00";

  // Update risk metrics
  if (data.riskMetrics) {
    document.getElementById("winStreak").innerText = data.riskMetrics.winStreak || "0";
    document.getElementById("lossStreak").innerText = data.riskMetrics.lossStreak || "0";
    document.getElementById("winRate").innerText = data.riskMetrics.winRate || "0.00";
    document.getElementById("compoundingMultiplier").innerText = data.riskMetrics.compoundingMultiplier || "1.00";
    document.getElementById("recoveryMode").innerText = data.riskMetrics.recoveryMode ? "ACTIVE" : "INACTIVE";
    document.getElementById("effectiveRisk").innerText = data.riskMetrics.effectiveRisk || "0.00";
  }

  // Update chart
  if (!chart) {
    chart = new Chart(document.getElementById("chart"), {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Price",
          data: [],
          borderColor: "#00ff00",
          backgroundColor: "rgba(0, 255, 0, 0.1)"
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: false }
        }
      }
    });
  }

  if (data.price) {
    const timeLabel = new Date().toLocaleTimeString();
    chart.data.labels.push(timeLabel);
    chart.data.datasets[0].data.push(data.price);

    // Keep only last 50 points
    if (chart.data.labels.length > 50) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  }

  // Update trades table
  const tbody = document.querySelector("#trades tbody");
  tbody.innerHTML = (data.trades || []).map(t => `
    <tr>
      <td>${t.symbol || ''}</td>
      <td class="${t.side === 'BUY' ? 'buy' : 'sell'}">${t.side || ''}</td>
      <td>${t.price ? t.price.toFixed(4) : ''}</td>
      <td>${t.aiScore ? t.aiScore.toFixed(3) : '0.000'}</td>
      <td>${t.mode || 'trend'}</td>
      <td>${t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ''}</td>
    </tr>
  `).join("");
});