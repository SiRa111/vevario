/**
 * Extracts plain text from a PDF file uploaded by the user.
 * Runs entirely client-side using the window-mounted PDF.js library.
 * 
 * @param {File} file - The file object from <input type="file">
 * @returns {Promise<string>} - Extracted text contents
 */
export async function extractTextFromPDF(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error("No file selected."));
    }

    const reader = new FileReader();

    reader.onload = async function (e) {
      try {
        const typedarray = new Uint8Array(e.target.result);
        
        // Find the library on the window object
        const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        if (!pdfjsLib) {
          return reject(new Error("PDF parsing library not loaded. Please try copy-pasting your resume text instead."));
        }

        // Initialize worker if not already set
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }

        // Load the document
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        
        let extractedText = "";

        // Extract text page by page
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // Reassemble line items
          const pageText = textContent.items
            .map(item => item.str)
            .join(" ");
          
          extractedText += `--- Page ${i} ---\n${pageText}\n\n`;
        }

        if (!extractedText.trim()) {
          return reject(new Error("No readable text found in PDF. The document might be image-only."));
        }

        resolve(extractedText.trim());
      } catch (error) {
        console.error("PDF.js parsing error:", error);
        reject(new Error("Failed to read PDF. Try copy-pasting your resume text."));
      }
    };

    reader.onerror = (error) => {
      console.error("FileReader error:", error);
      reject(new Error("Failed to read file buffer."));
    };

    reader.readAsArrayBuffer(file);
  });
}
