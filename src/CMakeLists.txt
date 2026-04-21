# This file was automatically generated for projects
# without default 'CMakeLists.txt' file.

FILE(GLOB_RECURSE app_sources ${CMAKE_SOURCE_DIR}/src/*.*)

idf_component_register(SRCS ${app_sources})
# Registra a partição SPIFFS (o nome 'storage' deve bater com o nome no partitions.csv)
spiffs_create_partition_image(storage ../data FLASH_IN_PROJECT)
