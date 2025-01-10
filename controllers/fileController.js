const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const { parse } = require("csv-parse/sync"); 
const Tesseract = require("tesseract.js"); 
const Document = require("../models/Document");
const axios = require("axios");
const fileType = require("file-type"); 


const extractText = async (filePath, fileType) => {
  const dataBuffer = fs.readFileSync(filePath);

  if (fileType === "pdf") {
    const parsedData = await pdfParse(dataBuffer);
    return parsedData.text;
  } else if (fileType === "txt") {
    return dataBuffer.toString("utf-8");
  } else if (fileType === "docx") {
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    return result.value;
  } else if (fileType === "xlsx") {
    const workbook = xlsx.readFile(filePath);
    let textContent = "";
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const sheetData = xlsx.utils.sheet_to_csv(sheet);
      textContent += `Sheet: ${sheetName}\n${sheetData}\n\n`;
    });
    return textContent;
  } else if (fileType === "csv") {
    const records = parse(dataBuffer, { columns: true });
    return JSON.stringify(records, null, 2);
  } else if (fileType === "json") {
    return JSON.stringify(JSON.parse(dataBuffer), null, 2);
  } else if (fileType === "html") {
    return dataBuffer.toString("utf-8");
  } else if (fileType === "xml") {
    return dataBuffer.toString("utf-8");
  } else if (["jpg", "jpeg", "png"].includes(fileType)) {
    const { data: { text } } = await Tesseract.recognize(filePath, "eng");
    return text;
  } else {
    throw new Error("Unsupported file type");
  }
};

const uploadFiles = async (req, res) => {
  try {
    const files = req.files; 

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const supportedFileTypes = ["pdf", "txt", "docx", "xlsx", "csv", "json", "html", "xml", "jpg", "jpeg", "png"];

    let combinedTitle = "";
    let combinedTextContent = "";
    let absolutePath = "";

    for (const file of files) {
      const { path: filePath, originalname } = file;
      const fileExtension = path.extname(originalname).toLowerCase().substring(1);

      if (!supportedFileTypes.includes(fileExtension)) {
        return res.status(400).json({ message: `Unsupported file format: ${originalname}` });
      }

      const textContent = await extractText(filePath, fileExtension);

      const basePath = "D:/qaPDF/server";
      absolutePath = path.join(basePath, filePath);

      combinedTitle += `${originalname}, `;
      combinedTextContent += `File: ${originalname}\n${textContent}\n\n`;
    }

    combinedTitle = combinedTitle.slice(0, -2);

    const document = new Document({ title: combinedTitle, textContent: combinedTextContent });
    await document.save();

    fs.unlinkSync(absolutePath);

    res.status(200).json({
      message: "Files uploaded successfully",
      document,
    });
  } catch (error) {
    res.status(500).json({ message: "Error uploading files", error: error.message });
  }
};

const uploadDriveLink = async (req, res) => {
  try {
    const { link } = req.body;

    if (!link) {
      return res.status(400).json({ message: "Drive link is required" });
    }

    const isValidLink = /^(http|https):\/\/drive\.google\.com\/file\/d\/([\w-]+)\/.*$/.test(link);
    if (!isValidLink) {
      return res.status(400).json({ message: "Invalid Google Drive link" });
    }

    const fileId = link.match(/\/d\/([\w-]+)\//)[1];

    const downloadUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

    const response = await axios.get(downloadUrl, { responseType: "stream" });

    const tempFilePath = path.join(__dirname, "../server/uploads", `${Date.now()}-drive-file`);
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const buffer = fs.readFileSync(tempFilePath);
    const type = await fileType.fromBuffer(buffer);
    let fileExtension = type ? type.ext : null;

    if (!fileExtension) {
      const contentType = response.headers["content-type"];
      fileExtension = contentType ? contentType.split("/")[1] : null;
    }

    if (!fileExtension) {
      throw new Error("Unable to determine file type");
    }

    const supportedFileTypes = ["pdf", "txt", "docx", "xlsx", "csv", "json", "html", "xml", "jpg", "jpeg", "png"];
    if (!supportedFileTypes.includes(fileExtension)) {
      fs.unlinkSync(tempFilePath); 
      return res.status(400).json({ message: `Unsupported file format: ${fileExtension}` });
    }

    const textContent = await extractText(tempFilePath, fileExtension);

    const firstWord = textContent.split(/\s+/)[0] || "File";

    const newFileName = `${firstWord}-${Date.now()}.${fileExtension}`;
    const finalFilePath = path.join(__dirname, "../server/uploads", newFileName);
    fs.renameSync(tempFilePath, finalFilePath);

    const document = new Document({ title: newFileName, textContent });
    await document.save();

    fs.unlinkSync(finalFilePath);

    res.status(200).json({ message: "Drive link processed successfully", document });
  } catch (error) {
    console.error("Error processing drive link:", error.message);
    res.status(500).json({ message: "Failed to process drive link", error: error.message });
  }
};

module.exports = { uploadFiles, uploadDriveLink };



