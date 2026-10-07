import CrewCore
import SwiftUI

/// What the check-in will be recorded on.
struct CheckInTarget: Equatable {
    var elementID: String
    var name: String
    var place: String
    var workTitle: String?
    var otherCrew: Bool
}

/// Browse rooms, then component types in the room (identical pipe segments collapse into one row).
struct RoomPicker: View {
    let catalog: CheckinCatalog
    let pick: (CheckInTarget) -> Void
    @State private var query = ""

    var rooms: [CatalogRoom] {
        query.isEmpty ? catalog.rooms : catalog.rooms.filter { $0.label.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        List(rooms) { room in
            NavigationLink(room.label) { ComponentPicker(room: room, pick: pick) }
        }
        .searchable(text: $query, prompt: "Room")
        .navigationTitle("Choose room")
    }
}

struct ComponentPicker: View {
    let room: CatalogRoom
    let pick: (CheckInTarget) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var groups: [(key: String, members: [CatalogComponent])] {
        let all = Dictionary(grouping: room.components) { "\($0.name)|\($0.trade)" }
        return all.map { ($0.key, $0.value) }
            .filter { query.isEmpty || $0.key.localizedCaseInsensitiveContains(query) }
            .sorted { $0.key < $1.key }
    }

    var body: some View {
        List(groups, id: \.key) { group in
            let first = group.members.first { $0.work_id != nil } ?? group.members.first { !$0.other_crew } ?? group.members[0]
            Button {
                pick(CheckInTarget(elementID: first.element_id, name: first.name, place: room.label,
                                   workTitle: first.work_title, otherCrew: first.other_crew))
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(first.name + (group.members.count > 1 ? " (\(group.members.count) in room)" : ""))
                    Text(first.work_title.map { "Tracked: \($0)" } ?? first.trade.capitalized)
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
            }
        }
        .searchable(text: $query, prompt: "Component, e.g. sink")
        .navigationTitle(room.name)
    }
}
