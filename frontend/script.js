// --- DOM Elements ---
const imageUpload = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const dropzone = document.getElementById('dropzone');
const previewContainer = document.getElementById('preview-container');
const storyInput = document.getElementById('story-input');
const generateBtn = document.getElementById('generate-btn');
const voiceTab = document.getElementById('voice-tab');
const textTab = document.getElementById('text-tab');
const voiceInputContainer = document.getElementById('voice-input-container');
const textInputContainer = document.getElementById('text-input-container');
const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const recordingStatus = document.getElementById('recording-status');
const languageSelect = document.getElementById('language-select');
const audioPlayback = document.getElementById('audio-playback');

// Output Area Elements
const loadingContainer = document.getElementById('loading-container');
const loadingStatus = document.getElementById('loading-status');
const placeholder = document.getElementById('placeholder');
const resultsContainer = document.getElementById('results-container');
const resultsHeader = document.getElementById('results-header');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const toast = document.getElementById('toast');

// --- State Variables ---
let imageBase64 = null;
let activeTab = 'voice';
let audioBase64 = null;
let mediaRecorder, audioChunks = [];

// --- Event Listeners ---
imageUpload.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        imagePreview.src = e.target.result;
        imageBase64 = e.target.result.split(',')[1];
        dropzone.classList.add('hidden');
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

removeImageBtn.addEventListener('click', () => {
    imageBase64 = null;
    imageUpload.value = '';
    previewContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
});

generateBtn.addEventListener('click', generateAssets);

voiceTab.addEventListener('click', () => switchTab('voice'));
textTab.addEventListener('click', () => switchTab('text'));
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// --- Core Functions ---
function switchTab(tab) {
    activeTab = tab;
    voiceTab.classList.toggle('active', tab === 'voice');
    textTab.classList.toggle('active', tab !== 'voice');
    voiceInputContainer.classList.toggle('hidden', tab !== 'voice');
    textInputContainer.classList.toggle('hidden', tab === 'voice');
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorder.start();

        recordBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        recordingStatus.classList.remove('hidden');
        audioPlayback.classList.add('hidden');

        audioBase64 = null;
        audioChunks = [];

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayback.src = audioUrl;
            audioPlayback.classList.remove('hidden');

            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                audioBase64 = reader.result.split(',')[1];
            };

            stopBtn.classList.add('hidden');
            recordBtn.classList.remove('hidden');
            recordingStatus.classList.add('hidden');
        };
    } catch (err) {
        console.error("Mic error:", err);
        showError("Could not access microphone. Please grant permission.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

async function generateAssets() {
    let storyText = storyInput.value.trim();

    // --- VALIDATION ---
    if (!imageBase64) {
        showError("Please upload an image.");
        return;
    }
    if (activeTab === 'text' && !storyText) {
        showError("Please type a story for your product.");
        return;
    }
    if (activeTab === 'voice' && !audioBase64) {
        showError("Please record a story for your product.");
        return;
    }

    setLoading(true);
    document.getElementById('output-area').scrollIntoView();

    try {
        // --- STEP 1: Transcribe audio if needed ---
        if (activeTab === 'voice') {
            updateLoaderStatus("Transcribing audio...");
            const transcribeResponse = await fetch('http://127.0.0.1:8000/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioBase64: audioBase64,
                    languageCode: languageSelect.value
                })
            });
            if (!transcribeResponse.ok) throw new Error("Audio transcription failed.");

            const transcribeResult = await transcribeResponse.json();
            storyText = transcribeResult.transcript;
            if (!storyText) throw new Error("Could not understand the audio. Please record again clearly.");
        }

        // --- STEP 2: Generate content ---
        updateLoaderStatus("Generating marketing content...");
        const generateResponse = await fetch('http://127.0.0.1:8000/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBase64: imageBase64,
                story: storyText
            })
        });

        if (!generateResponse.ok) {
            const errData = await generateResponse.json();
            throw new Error(errData.detail || `Server responded with status: ${generateResponse.status}`);
        }

        const result = await generateResponse.json();
        if (result.error) throw new Error(result.error);

        // --- STEP 3: Display results ---
        updateLoaderStatus("Displaying results...");
        displayResults(result.textData, result.imageUrls);

    } catch (err) {
        console.error("Error:", err);
        showError(err.message || "An unknown error occurred.");
    } finally {
        setLoading(false);
    }
}

function displayResults(textData, imageUrls) {
    resultsHeader.classList.remove('hidden');
    placeholder.classList.add('hidden'); // This now works correctly.

    const copyIcon = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    const downloadIcon = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`;
    
    resultsContainer.innerHTML = `
        <div class="p-4 border rounded-lg bg-white/50 border-white/30"><div class="flex justify-between items-center"><h3 class="text-lg font-semibold text-gray-800">Product Title</h3><button onclick="copyToClipboard('product-title', 'Title')" class="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 p-2 rounded-md hover:bg-indigo-50">${copyIcon} Copy</button></div><p id="product-title" class="mt-1 text-gray-700">${textData.productTitle}</p></div>
        <div class="p-4 border rounded-lg bg-white/50 border-white/30"><div class="flex justify-between items-center"><h3 class="text-lg font-semibold text-gray-800">Product Story</h3><button onclick="copyToClipboard('product-story', 'Story')" class="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 p-2 rounded-md hover:bg-indigo-50">${copyIcon} Copy</button></div><p id="product-story" class="mt-1 text-gray-700 whitespace-pre-wrap">${textData.productStory}</p></div>
        <div class="p-4 border rounded-lg bg-white/50 border-white/30"><h3 class="text-lg font-semibold text-gray-800">Social Media Captions</h3><ul class="mt-2 space-y-3">${textData.socialMediaCaptions.map((c, i) => `<li class="border-t border-gray-200/50 pt-3"><div class="flex justify-between items-start gap-4"><p id="caption-${i}" class="text-gray-700 text-sm">${c}</p><button onclick="copyToClipboard('caption-${i}', 'Caption')" class="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 flex-shrink-0 p-2 rounded-md hover:bg-indigo-50">${copyIcon} Copy</button></div></li>`).join('')}</ul></div>
        <div><h3 class="text-lg font-semibold text-gray-800 mb-2">AI-Generated Lifestyle Photos</h3><div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${imageUrls.map((url, i) => `<div class="relative group rounded-lg overflow-hidden shadow-lg"><img src="${url}" class="w-full h-full object-cover"><div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all duration-300 flex items-center justify-center"><button onclick="downloadImage('${url}', 'kalasetu-image-${i+1}.png')" class="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-60 px-4 py-2 rounded-full text-sm font-medium">${downloadIcon} Download</button></div></div>`).join('')}</div></div>`;
}

// --- UI Helper Functions ---
function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    loadingContainer.classList.toggle('hidden', !isLoading);
    // The problematic line that controlled the placeholder is now GONE.
    if (isLoading) {
        resultsContainer.innerHTML = '';
        resultsHeader.classList.add('hidden');
        errorContainer.classList.add('hidden');
        placeholder.classList.remove('hidden'); // Show placeholder when a new process starts
    }
}

function updateLoaderStatus(message) {
    loadingStatus.textContent = message;
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorContainer.classList.remove('hidden');
    resultsHeader.classList.add('hidden');
    placeholder.classList.remove('hidden'); // Show placeholder on error
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function copyToClipboard(elementId, type) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(() => showToast(`${type} copied!`));
}

function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
a.click();
    document.body.removeChild(a);
}