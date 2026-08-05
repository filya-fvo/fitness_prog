# Fitness Mini App — common tasks (GNU make / make from Git Bash)
# On Windows without make: use scripts\*.cmd

.PHONY: content content-full videos videos-dry test test-e2e frontend-build

content:
	./scripts/rebuild-content.cmd

content-full:
	./scripts/rebuild-content.cmd --full-download

videos:
	./scripts/apply-videos.cmd

videos-dry:
	./scripts/apply-videos.cmd --dry-run

test:
	cd frontend && npm test

test-e2e:
	cd frontend && npm run test:e2e

frontend-build:
	cd frontend && npm run build
