interface CertificateDetails {
  playerName: string;
  date: string;
  wins: number;
  gamesPlayed: number;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export async function downloadGameNightCertificate(details: CertificateDetails): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 1273;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the certificate artwork.");

  const { width, height } = canvas;
  context.fillStyle = "#f4eedf";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fffdf7";
  roundedRect(context, 48, 48, width - 96, height - 96, 18);
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "#b99b62";
  roundedRect(context, 70, 70, width - 140, height - 140, 10);
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = "#d9c99f";
  roundedRect(context, 86, 86, width - 172, height - 172, 8);
  context.stroke();

  const centerX = width / 2;
  context.textAlign = "center";
  context.fillStyle = "#50614c";
  context.font = '600 27px system-ui, sans-serif';
  context.letterSpacing = "8px";
  context.fillText("THE EVENING’S CHRONICLE", centerX, 220);
  context.letterSpacing = "0px";

  context.strokeStyle = "#b99b62";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX - 330, 270);
  context.lineTo(centerX + 330, 270);
  context.stroke();

  context.fillStyle = "#b18a48";
  context.beginPath();
  context.arc(centerX, 365, 58, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff8e6";
  context.font = '400 66px Georgia, "Times New Roman", serif';
  context.fillText("♛", centerX, 388);

  context.fillStyle = "#6b5330";
  context.font = '400 38px Georgia, "Times New Roman", serif';
  context.fillText("This certificate is graciously awarded to", centerX, 510);

  let nameFontSize = 100;
  context.font = `400 ${nameFontSize}px Georgia, "Times New Roman", serif`;
  while (context.measureText(details.playerName).width > width - 300 && nameFontSize > 50) {
    nameFontSize -= 2;
    context.font = `400 ${nameFontSize}px Georgia, "Times New Roman", serif`;
  }
  context.fillStyle = "#293d30";
  context.fillText(details.playerName, centerX, 650, width - 260);

  context.fillStyle = "#756b59";
  context.font = '400 31px Georgia, "Times New Roman", serif';
  context.fillText("for reigning supreme at the table", centerX, 720);

  context.strokeStyle = "#dfd4bd";
  context.beginPath();
  context.moveTo(centerX - 400, 780);
  context.lineTo(centerX + 400, 780);
  context.stroke();

  context.fillStyle = "#50614c";
  context.font = '600 27px system-ui, sans-serif';
  context.fillText(
    `${details.wins} ${details.wins === 1 ? "VICTORY" : "VICTORIES"}  ·  ${details.gamesPlayed} ${details.gamesPlayed === 1 ? "GAME" : "GAMES"} PLAYED`,
    centerX,
    850,
  );
  context.fillStyle = "#756b59";
  context.font = '400 29px Georgia, "Times New Roman", serif';
  context.fillText(
    new Date(details.date).toLocaleDateString(undefined, { dateStyle: "long" }),
    centerX,
    920,
  );

  context.strokeStyle = "#b99b62";
  context.beginPath();
  context.moveTo(centerX - 180, 1030);
  context.lineTo(centerX + 180, 1030);
  context.stroke();
  context.fillStyle = "#7c715d";
  context.font = '600 20px system-ui, sans-serif';
  context.letterSpacing = "4px";
  context.fillText("KEEPER OF THE TABLE", centerX, 1070);
  context.letterSpacing = "0px";

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 297, 210, undefined, "FAST");
  const safeName = details.playerName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "champion";
  pdf.save(`game-night-certificate-${safeName}.pdf`);
}
