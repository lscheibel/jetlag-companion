# osmium-tool, for the quarterly OSM boundary extract. m4-spec §4.
#
# Built here rather than pulled from a third-party image so the version is ours
# to pin and nobody needs `brew install osmium-tool` to reproduce an import.
FROM debian:bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends osmium-tool ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /data
ENTRYPOINT ["osmium"]
CMD ["--version"]
