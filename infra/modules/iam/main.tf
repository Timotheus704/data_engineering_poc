variable "project_id" { type = string }
variable "bindings" { type = map(list(string)), default = {} }

# Example pattern: for_each on role => members
resource "google_project_iam_binding" "binding" {
  for_each = var.bindings
  project  = var.project_id
  role     = each.key
  members  = each.value
}
