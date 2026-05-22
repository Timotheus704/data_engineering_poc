variable "project_id" {
  description = "GCP project id"
  type = string
}

variable "bindings" {
  description = "Map of role => list(members) to bind at the project level"
  type = map(list(string))
  default = {}
}
