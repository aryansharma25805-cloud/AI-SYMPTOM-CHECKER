// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get all required elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const liveBox = document.getElementById('liveBox');
    const chatArea = document.getElementById('chatArea');
    const langSelect = document.getElementById('langSelect');
    const mascotSpeak = document.getElementById('mascotSpeak');
    
    let recognition;
    let finalTranscript = '';
    let voices = [];

    // Initialize chat area if it doesn't exist
    if (!chatArea) {
        console.error('Chat area not found');
        return;
    }

    // ================= Chat UI =================
    function addChat(message, who = 'system', extraClass = '') {
        const div = document.createElement('div');
        div.className = `chat-message ${who === 'user' ? 'sent' : 'received'}`;
        div.innerHTML = `
            <div class="chat-bubble">
                ${message}
            </div>
            <div class="chat-message-time">${new Date().toLocaleTimeString()}</div>
        `;
        chatArea.appendChild(div);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // ================= Speech (TTS) =================
    function speakText(text, lang) {
        if (!mascotSpeak || !mascotSpeak.checked) return;
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(text);

            // Language mapping
            const langMap = { en: 'en-US', hi: 'hi-IN', pa: 'pa-IN' };
            u.lang = langMap[lang] || 'en-US';

            // Get voices
            voices = window.speechSynthesis.getVoices();

            // Pick voice based on language
            let selectedVoice = null;
            if (lang === 'en') {
                selectedVoice = voices.find(v => v.lang.includes('en'));
            } else if (lang === 'hi') {
                selectedVoice = voices.find(v => v.lang.includes('hi'));
            } else if (lang === 'pa') {
                selectedVoice = voices.find(v => v.lang.includes('pa'));
            }

            // Fallback to default voice
            if (!selectedVoice && voices.length > 0) {
                selectedVoice = voices[0];
            }

            if (selectedVoice) {
                u.voice = selectedVoice;
            }

            u.rate = 0.9;
            u.pitch = 1.0;
            u.volume = 1.0;

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        }
    }

    // ================= Speech Recognition (STT) =================
    function setupRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (liveBox) {
                liveBox.innerHTML = '<div class="placeholder">Speech recognition not supported in your browser. You can type instead.</div>';
            }
            if (startBtn) startBtn.disabled = true;
            return;
        }

        recognition = new SpeechRecognition();
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (evt) => {
            let interim = '';
            for (let i = evt.resultIndex; i < evt.results.length; ++i) {
                const transcript = evt.results[i][0].transcript;
                if (evt.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interim += transcript;
                }
            }
            if (liveBox) {
                liveBox.textContent = (finalTranscript + interim).trim() || 'Describe your symptoms clearly. For example: "I have had a headache and fever since yesterday."';
            }
        };

        recognition.onerror = (e) => {
            console.error('Recognition error', e);
            addChat('Speech recognition error. Try again or type your symptoms.', 'system');
        };

        recognition.onend = () => {
            if (stopBtn) stopBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            if (finalTranscript.trim()) {
                submitTranscript(finalTranscript.trim(), langSelect ? langSelect.value : 'en');
            }
        };
    }

    // Setup event listeners only if elements exist
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            finalTranscript = '';
            if (liveBox) {
                liveBox.textContent = '🎤 Listening...';
            }
            if (recognition) {
                recognition.lang = langSelect ? langSelect.value : 'en';
                recognition.start();
                startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            if (recognition) recognition.stop();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            finalTranscript = '';
            if (liveBox) {
                liveBox.innerHTML = '<div class="placeholder">Describe your symptoms clearly. For example: "I have had a headache and fever since yesterday."</div>';
            }
            if (chatArea) {
                chatArea.innerHTML = '';
            }
        });
    }

    // ================= Submit to Backend =================
    async function submitTranscript(text, lang) {
        if (chatArea) {
            addChat(text, 'user');
            addChat('Analyzing symptoms...', 'system');
        }

        // Map frontend lang to backend
        const langMapBackend = { en: 'English', hi: 'Hindi', pa: 'Punjabi' };
        const backendLang = langMapBackend[lang] || 'English';

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, lang: backendLang })
            });

            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            renderAnalysis(data, lang);
        } catch (err) {
            console.error(err);
            if (chatArea) {
                addChat('Failed to analyze. Try again later.', 'system');
            }
        }
    }

    // ================= Render Analysis =================
    function renderAnalysis(data, lang) {
        const { diagnoses = [], severity = 'low', advice = '', doctors = [] } = data;

        // Clear previous doctor cards
        if (chatArea) {
            const doctorCards = chatArea.querySelectorAll('.doctor-card');
            doctorCards.forEach(c => c.remove());
        }

        // Multilingual advice
        const adviceMap = {
            en: advice || (severity === 'low' ? 'Rest, hydrate, and monitor your symptoms.' : 'Please consult a doctor as soon as possible.'),
            hi: advice || (severity === 'low' ? 'आराम करें, हाइड्रेट रहें, और लक्षणों पर नजर रखें।' : 'कृपया जल्द से जल्द डॉक्टर से सलाह लें।'),
            pa: advice || (severity === 'low' ? 'ਆਰਾਮ ਕਰੋ, ਪਾਣੀ ਪੀਓ ਅਤੇ ਲੱਛਣਾਂ \'ਤੇ ਨਜ਼ਰ ਰੱਖੋ।' : 'ਕਿਰਪਾ ਕਰਕੇ ਜਲਦੀ ਤੋਂ ਜਲਦੀ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਕਰੋ।')
        };

        let html = `<b>Results (severity: ${severity.toUpperCase()}):</b><br/>`;
        if (diagnoses.length) {
            html += '<ol>';
            diagnoses.slice(0, 3).forEach(d => {
                const label = typeof d === 'string' ? d : d.label;
                html += `<li>${label}</li>`;
            });
            html += '</ol>';
        } else {
            html += '<p>No strong matches found.</p>';
        }
        html += `<div><b>Advice:</b> ${adviceMap[lang] || adviceMap.en}</div>`;
        
        if (chatArea) {
            addChat(html, 'system');
        }

        // TTS
        speakText(
            `Severity: ${severity}. Possible conditions: ${diagnoses.map(d => typeof d === 'string' ? d : d.label).join(', ')}. ${adviceMap[lang] || adviceMap.en}`,
            lang
        );

        if (severity === 'serious' && !doctors.length) {
            fetchDoctors();
        }
        if (doctors && doctors.length) {
            renderDoctors(doctors);
        }
    }

    // ================= Doctor Suggestions =================
    async function fetchDoctors() {
        try {
            const res = await fetch('/api/doctors?q=general');
            if (!res.ok) throw new Error('Doctor service error');
            const doctors = await res.json();
            renderDoctors(doctors);
        } catch (err) {
            console.error(err);
            if (chatArea) {
                addChat('Could not fetch doctor suggestions.', 'system');
            }
        }
    }

    function renderDoctors(doctors) {
        if (chatArea) {
            addChat('<b>Suggested doctors:</b>', 'system');
        }
        
        doctors.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'doctor-card';
            card.innerHTML = `
                <div style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                    <b>${doc.name}</b> — ${doc.specialty}<br/>
                    ${doc.phone ? 'Contact: ' + doc.phone : ''} <br/>
                    <button onclick="bookDoctor('${doc.id || ''}')">Book</button>
                    ${doc.phone ? `<button onclick="callNumber('${doc.phone}')">Call</button>` : ''}
                </div>`;
            if (chatArea) {
                chatArea.appendChild(card);
            }
        });
    }

    // ================= Doctor Actions =================
    window.bookDoctor = function (docId) {
        alert('Booking flow — integrate with backend using doctor id: ' + docId);
    };
    
    window.callNumber = function (phone) {
        if (phone) window.location.href = `tel:${phone}`;
    };

    // ================= Init =================
    setupRecognition();

    // Ensure voices are loaded
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            console.log("Voices loaded:", voices.map(v => v.name + " (" + v.lang + ")"));
        };
        
        // Trigger voiceschanged if voices are already loaded
        if (window.speechSynthesis.getVoices().length > 0) {
            voices = window.speechSynthesis.getVoices();
        }
    }
});