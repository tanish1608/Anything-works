import AVFoundation
import Speech
import SwiftUI

/// Speak the update instead of typing. Uses on-device recognition when the phone supports it.
@MainActor
final class SpeechDictation: ObservableObject {
    @Published var listening = false
    @Published var error: String?
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var base = ""

    /// Appends what is said to `text` live; call stop() or tap again to finish.
    func toggle(_ text: Binding<String>) {
        if listening { stop(); return }
        SFSpeechRecognizer.requestAuthorization { status in
            Task { @MainActor in
                guard status == .authorized else { self.error = "Allow speech recognition in Settings to dictate."; return }
                AVAudioApplication.requestRecordPermission { granted in
                    Task { @MainActor in
                        guard granted else { self.error = "Allow microphone access in Settings to dictate."; return }
                        self.start(text)
                    }
                }
            }
        }
    }

    private func start(_ text: Binding<String>) {
        guard let recognizer, recognizer.isAvailable else { error = "Speech recognition isn't available right now."; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request
            base = text.wrappedValue.isEmpty ? "" : text.wrappedValue + " "
            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
            listening = true
            error = nil
            task = recognizer.recognitionTask(with: request) { result, err in
                Task { @MainActor in
                    if let result { text.wrappedValue = self.base + result.bestTranscription.formattedString }
                    if err != nil || result?.isFinal == true { self.stop() }
                }
            }
        } catch {
            self.error = "Couldn't start the microphone."
            stop()
        }
    }

    func stop() {
        guard listening || engine.isRunning else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// A text field with a microphone button for dictation.
struct VoiceNoteField: View {
    let placeholder: String
    @Binding var text: String
    @StateObject private var dictation = SpeechDictation()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(placeholder, text: $text, axis: .vertical).lineLimit(3...6)
            Button { dictation.toggle($text) } label: {
                Label(dictation.listening ? "Stop" : "Speak instead", systemImage: dictation.listening ? "stop.circle.fill" : "mic.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(dictation.listening ? .red : Theme.accent)
            if dictation.listening { Text("Listening… speak normally, then tap Stop.").font(.caption).foregroundStyle(Theme.secondary) }
            if let error = dictation.error { Text(error).font(.caption).foregroundStyle(.orange) }
        }
        .onDisappear { dictation.stop() }
    }
}
