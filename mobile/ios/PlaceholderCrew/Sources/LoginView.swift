import SwiftUI

struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Placeholder AI").font(.largeTitle.bold())
                        Text("Crew updates: photos, location and measurements for your assigned work.")
                            .foregroundStyle(Theme.secondary)
                    }
                    .listRowBackground(Color.clear)
                }
                Section("Account") {
                    TextField("Email", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Password", text: $password).textContentType(.password)
                }
                Section {
                    TextField("Server", text: $model.serverURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: { Text("Server") } footer: {
                    Text("Defaults to the cloud server. For a local backend use your computer's Wi-Fi address, e.g. http://192.168.1.20:8000.")
                }
                if let message = model.message {
                    Section { Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.orange) }
                }
                Section {
                    Button {
                        Task { await model.signIn(email: email, password: password) }
                    } label: {
                        HStack { Spacer(); if model.loading { ProgressView() } else { Text("Sign in").bold() }; Spacer() }
                    }
                    .disabled(email.isEmpty || password.count < 8 || model.loading)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
        }
    }
}
