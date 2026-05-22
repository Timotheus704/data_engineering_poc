# Production environment notes

This directory intentionally does not contain a full production Terraform configuration. A production deployment would typically add the following concerns and controls:

- VPC networking and subnets (private clusters / private IPs)
- Private Service Connect or Private Google Access for cross-project service connectivity
- CMEK (Customer Managed Encryption Keys) for datasets and buckets
- Stricter IAM (principle of least privilege, IAM Deny policies, audited service accounts)
- Managed Composer (Cloud Composer) or fully managed orchestration (instead of a local Airflow instance)
- Secure backend state (remote state in secure backend, state locking)

This README documents the intended production hardening and is a reminder that production infrastructure requires additional operational controls and review.
